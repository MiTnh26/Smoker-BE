// src/controllers/adminVoucherController.js
const voucherModel = require("../models/voucherModel");

class AdminVoucherController {
  // GET /api/admin/vouchers - Lấy danh sách vouchers
  async getVouchers(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      const vouchers = await voucherModel.getAllVouchers({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const total = await voucherModel.countVouchers({ status });

      // Format dates in response
      const formattedVouchers = vouchers.map(voucher => ({
        ...voucher,
        CreatedAt: voucher.CreatedAt ? new Date(voucher.CreatedAt).toISOString() : null
      }));

      return res.status(200).json({
        success: true,
        data: formattedVouchers,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + formattedVouchers.length < total
        }
      });
    } catch (error) {
      console.error("❌ getVouchers error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching vouchers",
        error: error.message
      });
    }
  }

  // GET /api/admin/vouchers/:id - Lấy voucher theo ID
  async getVoucherById(req, res) {
    try {
      const { id } = req.params;
      const voucher = await voucherModel.getVoucherById(id);

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: voucher
      });
    } catch (error) {
      console.error("getVoucherById error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching voucher",
        error: error.message
      });
    }
  }

  // POST /api/admin/vouchers - Tạo voucher mới
  async createVoucher(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        console.log('❌ No accountId in req.user');
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        voucherName,
        voucherCode,
        maxUsage,
        status = "ACTIVE"
      } = req.body;

      console.log('🔍 Validation step 1 - Required fields check');
      // Validate required fields
      if (!voucherName || !voucherCode || !maxUsage) {
        console.log('❌ Missing required fields');
        return res.status(400).json({
          success: false,
          message: "Missing required fields: voucherName, voucherCode, maxUsage"
        });
      }
      console.log('✅ Required fields OK');

      console.log('🔍 Validation step 2 - Check duplicate voucher code');
      // Check if voucher code already exists
      const existingVoucher = await voucherModel.getVoucherByCode(voucherCode);
      if (existingVoucher) {
        console.log('❌ Voucher code already exists:', voucherCode);
        return res.status(400).json({
          success: false,
          message: "Voucher code already exists"
        });
      }
      console.log('✅ Voucher code unique');
      console.log('🔍 Calling voucherModel.createVoucher');

      const voucher = await voucherModel.createVoucher({
        voucherName,
        voucherCode,
        maxUsage,
        status
      });

      console.log('🔍 Voucher created successfully:', voucher);

      // Format dates for JSON response - ensure all dates are serializable
      const formattedVoucher = {
        ...voucher,
        CreatedAt: voucher.CreatedAt ? new Date(voucher.CreatedAt).toISOString() : null
      };

      return res.status(201).json({
        success: true,
        data: formattedVoucher,
        message: "Voucher created successfully"
      });
    } catch (error) {
      console.error("❌ createVoucher error:", error);
      console.log('🔍 Sending error response');
      return res.status(500).json({
        success: false,
        message: "Error creating voucher",
        error: error.message
      });
    }
  }

  // PUT /api/admin/vouchers/:id - Cập nhật voucher
  async updateVoucher(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;


      // Check if voucher exists
      const existingVoucher = await voucherModel.getVoucherById(id);
      if (!existingVoucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }

      // Check voucher code uniqueness if updating code
      if (updates.voucherCode && updates.voucherCode !== existingVoucher.VoucherCode) {
        const codeExists = await voucherModel.getVoucherByCode(updates.voucherCode);
        if (codeExists) {
          return res.status(400).json({
            success: false,
            message: "Voucher code already exists"
          });
        }
      }

      const updatedVoucher = await voucherModel.updateVoucher(id, updates);

      return res.status(200).json({
        success: true,
        data: updatedVoucher,
        message: "Voucher updated successfully"
      });
    } catch (error) {
      console.error("updateVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Error updating voucher",
        error: error.message
      });
    }
  }

  // DELETE /api/admin/vouchers/:id - Xóa voucher
  async deleteVoucher(req, res) {
    try {
      const { id } = req.params;

      // Check if voucher exists
      const voucher = await voucherModel.getVoucherById(id);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }

      // Check if voucher is being used
      if (voucher.UsedCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete voucher that has been used"
        });
      }

      const deletedVoucher = await voucherModel.deleteVoucher(id);

      return res.status(200).json({
        success: true,
        data: deletedVoucher,
        message: "Voucher deleted successfully"
      });
    } catch (error) {
      console.error("deleteVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting voucher",
        error: error.message
      });
    }
  }

  // GET /api/admin/vouchers/stats - Thống kê voucher
  async getVoucherStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      // Tổng số voucher
      const totalVouchers = await voucherModel.countVouchers();

      // Voucher active
      const activeVouchers = await voucherModel.countVouchers({ status: "ACTIVE" });

      // Voucher hết hạn
      const expiredVouchers = await voucherModel.countVouchers({ status: "EXPIRED" });

      // Voucher đã dùng hết
      const usedUpVouchers = await voucherModel.countVouchers({ status: "USED_UP" });

      // Tổng discount đã áp dụng (từ BookedSchedules)
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();

      let statsQuery = `
        SELECT
          COUNT(*) as totalBookingsWithVoucher,
          SUM(OriginalPrice - TotalAmount) as totalDiscountAmount,
          SUM(CAST(OriginalPrice * 0.15 AS INT)) as totalCommissionAmount,
          SUM(OriginalPrice - CAST(OriginalPrice * 0.15 AS INT)) as totalBarReceiveAmount
        FROM BookedSchedules
        WHERE VoucherId IS NOT NULL AND PaymentStatus = 'Paid'
      `;

      const whereConditions = [];
      if (startDate) {
        whereConditions.push("created_at >= @startDate");
      }
      if (endDate) {
        whereConditions.push("created_at <= @endDate");
      }

      if (whereConditions.length > 0) {
        statsQuery += " AND " + whereConditions.join(" AND ");
      }

      const request = pool.request();
      if (startDate) request.input("startDate", sql.DateTime, new Date(startDate));
      if (endDate) request.input("endDate", sql.DateTime, new Date(endDate));

      const statsResult = await request.query(statsQuery);
      const stats = statsResult.recordset[0];

      return res.status(200).json({
        success: true,
        data: {
          voucherStats: {
            totalVouchers,
            activeVouchers,
            expiredVouchers,
            usedUpVouchers
          },
          usageStats: {
            totalBookingsWithVoucher: stats.totalBookingsWithVoucher || 0,
            totalDiscountAmount: stats.totalDiscountAmount || 0,
            totalCommissionAmount: stats.totalCommissionAmount || 0,
            totalBarReceiveAmount: stats.totalBarReceiveAmount || 0
          }
        }
      });
    } catch (error) {
      console.error("getVoucherStats error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching voucher stats",
        error: error.message
      });
    }
  }

  /**
   * Admin xem danh sách voucher do bar tạo kèm thống kê doanh thu
   * GET /api/admin/vouchers/bar-vouchers?barPageId=xxx
   */
  async getBarVouchersWithStats(req, res) {
    try {
      const { barPageId } = req.query;
      console.log("[AdminVoucherController] getBarVouchersWithStats called, barPageId:", barPageId);
      
      const vouchers = await voucherModel.getBarVouchersWithStats(barPageId || null);
      console.log("[AdminVoucherController] getBarVouchersWithStats - Found vouchers:", vouchers?.length || 0);
      
      return res.json({
        success: true,
        data: vouchers
      });
    } catch (error) {
      console.error("[AdminVoucherController] getBarVouchersWithStats error:", error);
      console.error("[AdminVoucherController] getBarVouchersWithStats error stack:", error.stack);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Admin xem danh sách các bar đã tạo voucher (để filter)
   * GET /api/admin/vouchers/bar-vouchers/bars
   */
  async getBarsWithVouchers(req, res) {
    try {
      console.log("[AdminVoucherController] getBarsWithVouchers called");
      const bars = await voucherModel.getBarsWithVouchers();
      console.log("[AdminVoucherController] getBarsWithVouchers - Found bars:", bars?.length || 0);
      
      return res.json({
        success: true,
        data: bars
      });
    } catch (error) {
      console.error("[AdminVoucherController] getBarsWithVouchers error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Admin xem danh sách voucher do bar tạo chờ duyệt - DEPRECATED
   * GET /api/admin/vouchers/bar-vouchers/pending
   */
  async getBarVouchersPending(req, res) {
    try {
      console.log("[AdminVoucherController] getBarVouchersPending called (DEPRECATED - use getBarVouchersWithStats)");
      const vouchers = await voucherModel.getBarVouchersPending();
      console.log("[AdminVoucherController] getBarVouchersPending - Found vouchers:", vouchers?.length || 0);
      
      return res.json({
        success: true,
        data: vouchers
      });
    } catch (error) {
      console.error("[AdminVoucherController] getBarVouchersPending error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Admin duyệt voucher từ bar
   * POST /api/admin/vouchers/:id/approve-bar
   */
  async approveBarVoucher(req, res) {
    try {
      const { id } = req.params;
      const managerId = req.user?.id || req.user?.managerId;
      
      if (!managerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      const voucher = await voucherModel.getVoucherById(id);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }
      
      if (voucher.VoucherStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Voucher đã được xử lý (status: ${voucher.VoucherStatus})`
        });
      }
      
      const updatedVoucher = await voucherModel.approveBarVoucher(id, managerId);
      
      // Gửi notification cho bar
      try {
        if (voucher.BarPageId) {
          const barPageModel = require("../models/barPageModel");
          const barPage = await barPageModel.getBarPageById(voucher.BarPageId);
          if (barPage && barPage.AccountId) {
            const entityAccountModel = require("../models/entityAccountModel");
            const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(voucher.BarPageId, "BarPage");
            const adminEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(managerId, "Account");
            
            if (barEntityAccountId && adminEntityAccountId) {
              await notificationService.createNotification({
                type: "Confirm",
                sender: adminEntityAccountId,
                receiver: barEntityAccountId,
                content: `Voucher "${voucher.VoucherName}" đã được duyệt`,
                link: `/bar/vouchers`
              });
            }
          }
        }
      } catch (notifError) {
        console.warn("[AdminVoucherController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Voucher đã được duyệt",
        data: updatedVoucher
      });
      
    } catch (error) {
      console.error("[AdminVoucherController] approveBarVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Admin từ chối voucher từ bar
   * POST /api/admin/vouchers/:id/reject-bar
   */
  async rejectBarVoucher(req, res) {
    try {
      const { id } = req.params;
      const managerId = req.user?.id || req.user?.managerId;
      const { rejectedReason } = req.body;
      
      if (!managerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      const voucher = await voucherModel.getVoucherById(id);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }
      
      if (voucher.VoucherStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Voucher đã được xử lý (status: ${voucher.VoucherStatus})`
        });
      }
      
      const updatedVoucher = await voucherModel.rejectBarVoucher(id, managerId, rejectedReason);
      
      // Gửi notification cho bar
      try {
        if (voucher.BarPageId) {
          const barPageModel = require("../models/barPageModel");
          const barPage = await barPageModel.getBarPageById(voucher.BarPageId);
          if (barPage && barPage.AccountId) {
            const entityAccountModel = require("../models/entityAccountModel");
            const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(voucher.BarPageId, "BarPage");
            const adminEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(managerId, "Account");
            
            if (barEntityAccountId && adminEntityAccountId) {
              await notificationService.createNotification({
                type: "Info",
                sender: adminEntityAccountId,
                receiver: barEntityAccountId,
                content: `Voucher "${voucher.VoucherName}" đã bị từ chối. Lý do: ${rejectedReason || 'Không có lý do'}`,
                link: `/bar/vouchers`
              });
            }
          }
        }
      } catch (notifError) {
        console.warn("[AdminVoucherController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Voucher đã bị từ chối",
        data: updatedVoucher
      });
      
    } catch (error) {
      console.error("[AdminVoucherController] rejectBarVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/admin/vouchers/code/:code - Lấy voucher theo code (public endpoint)
  async getVoucherByCode(req, res) {
    try {
      const { code } = req.params;
      
      if (!code) {
        return res.status(400).json({
          success: false,
          message: "Voucher code is required"
        });
      }

      const voucher = await voucherModel.getVoucherByCode(code);

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }

      // Loại bỏ VoucherId khỏi response
      const { VoucherId, ...voucherWithoutId } = voucher;

      return res.status(200).json({
        success: true,
        data: voucherWithoutId
      });
    } catch (error) {
      console.error("getVoucherByCode error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching voucher",
        error: error.message
      });
    }
  }
}

module.exports = new AdminVoucherController();
