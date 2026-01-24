const refundRequestModel = require("../models/refundRequestModel");
const bookedScheduleModel = require("../models/bookedScheduleModel");
const notificationService = require("../services/notificationService");

class RefundRequestController {
  /**
   * Người dùng yêu cầu hoàn tiền
   * POST /api/booking/:id/request-refund
   */
  async createRefundRequest(req, res) {
    try {
      const userId = req.user?.id || req.user?.accountId;
      const { id } = req.params; // bookedScheduleId
      const { reason } = req.body;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      // Kiểm tra booking
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }
      
      // Kiểm tra quyền sở hữu
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      const entityAccountModel = require("../models/entityAccountModel");
      const userEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(userId, "Account");
      
      if (!userEntityAccountId || booking.BookerId !== userEntityAccountId) {
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }
      
      // Kiểm tra đã có refund request chưa
      const existingRequest = await refundRequestModel.findByBookedScheduleId(id);
      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: "Đã có yêu cầu hoàn tiền cho booking này",
          data: existingRequest
        });
      }
      
      // Tính số tiền cần hoàn (voucher + deposit)
      // Xác định loại booking: DJ/Dancer (50k) hoặc Bar table (100k)
      const receiverEntityInfo = await entityAccountModel.verifyEntityAccountId(booking.ReceiverId);
      const isDJOrDancer = receiverEntityInfo?.EntityType === 'BusinessAccount';
      
      // DJ/Dancer: 50.000 VNĐ, Bar table: 100.000 VNĐ
      const defaultDeposit = isDJOrDancer ? 50000 : 100000;
      let refundAmount = booking.DepositAmount || defaultDeposit;
      
      if (booking.VoucherDistributionId) {
        const voucherDistributionModel = require("../models/voucherDistributionModel");
        const distribution = await voucherDistributionModel.findByBookedScheduleId(id);
        if (distribution) {
          refundAmount += parseFloat(distribution.SalePrice || 0);
        }
      }
      
      // Tạo refund request
      const refundRequest = await refundRequestModel.createRefundRequest({
        bookedScheduleId: id,
        userId,
        amount: refundAmount,
        reason
      });
      
      // Gửi notification cho kế toán
      try {
        const accountantResult = await pool.request().query(`
          SELECT TOP 1 AccountId 
          FROM Accounts 
          WHERE Role = 'Accountant'
          ORDER BY CreatedAt ASC
        `);
        
        if (accountantResult.recordset.length > 0) {
          const accountantAccountId = accountantResult.recordset[0].AccountId;
          const accountantEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(accountantAccountId, "Account");
          
          if (accountantEntityAccountId && userEntityAccountId) {
            await notificationService.createNotification({
              type: "Info",
              sender: userEntityAccountId,
              receiver: accountantEntityAccountId,
              content: `Yêu cầu hoàn tiền ${refundAmount.toLocaleString('vi-VN')} đ cho booking #${id.substring(0, 8)}`,
              link: `/accountant/refund-requests`
            });
          }
        }
      } catch (notifError) {
        console.warn("[RefundRequestController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu hoàn tiền đã được gửi",
        data: refundRequest
      });
      
    } catch (error) {
      console.error("[RefundRequestController] createRefundRequest error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  /**
   * Kế toán xem danh sách yêu cầu hoàn tiền
   * GET /api/accountant/refund-requests
   */
  async getRefundRequests(req, res) {
    try {
      const accountantId = req.user?.id || req.user?.accountId;
      const { status, limit = 50, offset = 0 } = req.query;
      
      if (!accountantId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      const refundRequests = await refundRequestModel.getAllRefundRequests({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      return res.json({
        success: true,
        data: refundRequests
      });
      
    } catch (error) {
      console.error("[RefundRequestController] getRefundRequests error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  /**
   * Kế toán xử lý hoàn tiền (upload minh chứng)
   * POST /api/accountant/refund-requests/:id/process
   */
  async processRefund(req, res) {
    try {
      const userId = req.user?.id;
      const userType = req.user?.type; // "manager" hoặc undefined
      const { id } = req.params;
      const { transferProofImage, transferNote } = req.body;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      if (!transferProofImage) {
        return res.status(400).json({
          success: false,
          message: "transferProofImage is required"
        });
      }
      
      // ProcessedBy phải là ManagerId (FOREIGN KEY constraint với Managers table)
      // Chỉ Manager với role Accountant mới có thể xử lý refund
      let managerId = null;
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      
      if (userType === "manager") {
        // Nếu là Manager, userId chính là ManagerId
        managerId = userId;
        
        // Kiểm tra ManagerId có tồn tại và có role Accountant không
        const managerCheck = await pool.request()
          .input("ManagerId", sql.UniqueIdentifier, managerId)
          .query(`SELECT ManagerId, Role FROM Managers WHERE ManagerId = @ManagerId AND Role = 'Accountant'`);
        
        if (managerCheck.recordset.length === 0) {
          return res.status(403).json({
            success: false,
            message: "Chỉ Accountant mới có thể xử lý hoàn tiền"
          });
        }
      } else {
        // Nếu không phải Manager, không thể xử lý refund
        return res.status(403).json({
          success: false,
          message: "Chỉ Accountant (Manager) mới có thể xử lý hoàn tiền"
        });
      }
      
      console.log("[RefundRequestController] processRefund - managerId:", managerId);
      
      const refundRequest = await refundRequestModel.findById(id);
      if (!refundRequest) {
        return res.status(404).json({
          success: false,
          message: "Refund request not found"
        });
      }
      
      if (refundRequest.Status !== 'processing' && refundRequest.Status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Refund request đã được xử lý (status: ${refundRequest.Status})`
        });
      }
      
      // Sử dụng ManagerId thay vì AccountId
      const updated = await refundRequestModel.processRefund(id, managerId, {
        transferProofImage,
        transferNote
      });
      
      // Gửi notification cho người dùng (tự động emit WebSocket qua notificationService)
      try {
        const entityAccountModel = require("../models/entityAccountModel");
        const userEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(refundRequest.UserId, "Account");
        
        // Manager không có EntityAccountId, nên có thể bỏ qua sender hoặc dùng null
        if (userEntityAccountId) {
          // createNotification sẽ tự động emit WebSocket event 'new_notification' đến room của userEntityAccountId
          const notification = await notificationService.createNotification({
            type: "Confirm",
            sender: null, // Manager không có EntityAccountId
            receiver: refundRequest.UserId, // AccountId
            receiverEntityAccountId: userEntityAccountId, // EntityAccountId để emit WebSocket
            content: `Yêu cầu hoàn tiền ${refundRequest.Amount.toLocaleString('vi-VN')} đ đã được xử lý và chuyển khoản thành công`,
            link: `/booking/my`
          });
          
          console.log("[RefundRequestController] Refund notification created and WebSocket event emitted:", {
            notificationId: notification?._id,
            receiverEntityAccountId: userEntityAccountId,
            amount: refundRequest.Amount
          });
        } else {
          console.warn("[RefundRequestController] Could not find userEntityAccountId for refund notification");
        }
      } catch (notifError) {
        console.error("[RefundRequestController] Failed to send notification:", notifError);
        // Không throw error để không ảnh hưởng đến response thành công
      }
      
      return res.json({
        success: true,
        message: "Hoàn tiền đã được xử lý",
        data: updated
      });
      
    } catch (error) {
      console.error("[RefundRequestController] processRefund error:", error);
      console.error("[RefundRequestController] Error details:", {
        message: error.message,
        code: error.code,
        number: error.number
      });
      
      // Kiểm tra lỗi FOREIGN KEY constraint
      if (error.message && error.message.includes('FOREIGN KEY constraint')) {
        return res.status(400).json({
          success: false,
          message: "AccountId không hợp lệ. Vui lòng đăng nhập lại và thử lại."
        });
      }
      
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi khi xử lý hoàn tiền"
      });
    }
  }
}

module.exports = new RefundRequestController();
