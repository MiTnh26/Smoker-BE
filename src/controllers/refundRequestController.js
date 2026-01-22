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
      let refundAmount = booking.DepositAmount || 100000; // Cọc 100k
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
      const accountantId = req.user?.id || req.user?.accountId;
      const { id } = req.params;
      const { transferProofImage, transferNote } = req.body;
      
      if (!accountantId) {
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
      
      const updated = await refundRequestModel.processRefund(id, accountantId, {
        transferProofImage,
        transferNote
      });
      
      // Gửi notification cho người dùng
      try {
        const entityAccountModel = require("../models/entityAccountModel");
        const userEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(refundRequest.UserId, "Account");
        const accountantEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(accountantId, "Account");
        
        if (userEntityAccountId && accountantEntityAccountId) {
          await notificationService.createNotification({
            type: "Confirm",
            sender: accountantEntityAccountId,
            receiver: userEntityAccountId,
            content: `Yêu cầu hoàn tiền ${refundRequest.Amount.toLocaleString('vi-VN')} đ đã được xử lý và chuyển khoản`,
            link: `/booking/my`
          });
        }
      } catch (notifError) {
        console.warn("[RefundRequestController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Hoàn tiền đã được xử lý",
        data: updated
      });
      
    } catch (error) {
      console.error("[RefundRequestController] processRefund error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new RefundRequestController();
