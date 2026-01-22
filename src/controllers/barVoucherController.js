const voucherModel = require("../models/voucherModel");
const barPageModel = require("../models/barPageModel");
const notificationService = require("../services/notificationService");

class BarVoucherController {
  /**
   * Bar tạo voucher và gửi cho admin
   * POST /api/bar/vouchers
   */
  async createVoucher(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { 
        voucherName, 
        voucherCode,
        maxUsage,
        originalValue
      } = req.body;
      
      if (!accountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Validate required fields
      if (!voucherName || !voucherCode || !maxUsage || !originalValue) {
        return res.status(400).json({ 
          success: false, 
          message: "voucherName, voucherCode, maxUsage, originalValue are required" 
        });
      }
      
      // Check if voucher code already exists
      const existingVoucher = await voucherModel.getVoucherByCode(voucherCode);
      if (existingVoucher) {
        return res.status(400).json({ 
          success: false, 
          message: "Mã voucher đã tồn tại. Vui lòng chọn mã khác." 
        });
      }
      
      // Lấy BarPage của account
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied - No BarPage found for this account" 
        });
      }
      
      // Tạo voucher
      const voucher = await voucherModel.createBarVoucher({
        barPageId: barPage.BarPageId,
        voucherName,
        voucherCode,
        maxUsage,
        originalValue
      });
      
      // Gửi notification cho admin (thông báo có voucher mới)
      try {
        const { getPool, sql } = require("../db/sqlserver");
        const pool = await getPool();
        const adminResult = await pool.request().query(`
          SELECT TOP 1 AccountId 
          FROM Accounts 
          WHERE Role = 'Admin'
          ORDER BY CreatedAt ASC
        `);
        
        if (adminResult.recordset.length > 0) {
          const adminAccountId = adminResult.recordset[0].AccountId;
          const entityAccountModel = require("../models/entityAccountModel");
          const adminEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(adminAccountId, "Account");
          const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(barPage.BarPageId, "BarPage");
          
          if (adminEntityAccountId && barEntityAccountId) {
            await notificationService.createNotification({
              type: "Info",
              sender: barEntityAccountId,
              receiver: adminEntityAccountId,
              content: `Quán ${barPage.BarName} đã tạo voucher "${voucherName}" mới`,
              link: `/admin/vouchers/bar-vouchers`
            });
          }
        }
      } catch (notifError) {
        console.warn("[BarVoucherController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Voucher đã được tạo và tự động kích hoạt",
        data: voucher
      });
      
    } catch (error) {
      console.error("[BarVoucherController] createVoucher error:", error);
      
      // Handle duplicate key error specifically
      if (error.message && error.message.includes('UNIQUE KEY constraint') && error.message.includes('VoucherCode')) {
        return res.status(400).json({ 
          success: false, 
          message: "Mã voucher đã tồn tại. Vui lòng chọn mã khác." 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
  
  /**
   * Bar xem danh sách voucher đã tạo
   * GET /api/bar/vouchers
   */
  async getMyVouchers(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Lấy BarPage của account
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied - No BarPage found" 
        });
      }
      
      const vouchers = await voucherModel.getVouchersByBarPageId(barPage.BarPageId);
      
      return res.json({
        success: true,
        data: vouchers
      });
      
    } catch (error) {
      console.error("[BarVoucherController] getMyVouchers error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
}

module.exports = new BarVoucherController();
