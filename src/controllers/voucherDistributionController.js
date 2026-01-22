const voucherDistributionModel = require("../models/voucherDistributionModel");
const voucherModel = require("../models/voucherModel");
const bookedScheduleModel = require("../models/bookedScheduleModel");
const notificationService = require("../services/notificationService");

class VoucherDistributionController {
  /**
   * Admin phân phối voucher cho người dùng khi đặt bàn
   * POST /api/admin/vouchers/distribute
   * Body: { voucherId, bookedScheduleId, userId, salePrice }
   */
  async distributeVoucher(req, res) {
    try {
      const managerId = req.user?.id || req.user?.managerId;
      const { voucherId, bookedScheduleId, userId, salePrice } = req.body;
      
      if (!managerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }
      
      if (!voucherId || !bookedScheduleId || !userId || !salePrice) {
        return res.status(400).json({
          success: false,
          message: "voucherId, bookedScheduleId, userId, salePrice are required"
        });
      }
      
      // Lấy voucher gốc từ bar
      const voucher = await voucherModel.getVoucherById(voucherId);
      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: "Voucher not found"
        });
      }
      
      if (voucher.VoucherStatus !== 'approved' || voucher.VoucherType !== 'bar_created') {
        return res.status(400).json({
          success: false,
          message: "Voucher chưa được duyệt hoặc không phải voucher từ bar"
        });
      }
      
      if (!voucher.OriginalValue) {
        return res.status(400).json({
          success: false,
          message: "Voucher không có OriginalValue"
        });
      }
      
      // Tính toán profit
      const { adminProfit, systemProfit, userBenefit } = 
        voucherDistributionModel.calculateProfit(voucher.OriginalValue, salePrice);
      
      // Tạo voucher mới cho người dùng (nếu cần) hoặc dùng voucher gốc
      // Ở đây ta có thể tạo voucher mới với VoucherCode riêng cho người dùng
      let userVoucherId = null;
      const crypto = require('crypto');
      const userVoucherCode = `${voucher.VoucherCode}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      
      // Tạo voucher mới cho người dùng
      const userVoucher = await voucherModel.createVoucher({
        voucherName: voucher.VoucherName,
        voucherCode: userVoucherCode,
        status: "ACTIVE",
        maxUsage: 1, // Mỗi voucher chỉ dùng 1 lần
        createdByAdmin: managerId
      });
      
      userVoucherId = userVoucher.VoucherId;
      
      // Update userVoucher với thông tin phân phối
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      await pool.request()
        .input("VoucherId", sql.UniqueIdentifier, userVoucherId)
        .input("OriginalValue", sql.Decimal(18, 2), voucher.OriginalValue)
        .input("SalePrice", sql.Decimal(18, 2), salePrice)
        .input("VoucherType", sql.NVarChar(50), 'bar_distributed')
        .query(`
          UPDATE Vouchers
          SET OriginalValue = @OriginalValue,
              SalePrice = @SalePrice,
              VoucherType = @VoucherType
          WHERE VoucherId = @VoucherId
        `);
      
      // Tạo VoucherDistribution
      const distribution = await voucherDistributionModel.createDistribution({
        voucherId: voucher.VoucherId,
        userVoucherId: userVoucherId,
        bookedScheduleId,
        adminId: managerId,
        userId,
        originalValue: voucher.OriginalValue,
        salePrice,
        adminProfit,
        systemProfit,
        userBenefit,
        status: 'active'
      });
      
      // Update BookedSchedule với VoucherDistributionId và VoucherCode
      await pool.request()
        .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
        .input("VoucherDistributionId", sql.UniqueIdentifier, distribution.DistributionId)
        .input("VoucherCode", sql.NVarChar(50), userVoucherCode)
        .input("VoucherId", sql.UniqueIdentifier, userVoucherId)
        .query(`
          UPDATE BookedSchedules
          SET VoucherDistributionId = @VoucherDistributionId,
              VoucherCode = @VoucherCode,
              VoucherId = @VoucherId
          WHERE BookedScheduleId = @BookedScheduleId
        `);
      
      return res.json({
        success: true,
        message: "Voucher đã được phân phối",
        data: {
          distribution,
          voucherCode: userVoucherCode,
          adminProfit,
          systemProfit,
          userBenefit
        }
      });
      
    } catch (error) {
      console.error("[VoucherDistributionController] distributeVoucher error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
  
  /**
   * Lấy danh sách distributions
   * GET /api/admin/voucher-distributions
   */
  async getDistributions(req, res) {
    try {
      const { adminId, userId, status, limit = 50, offset = 0 } = req.query;
      
      const distributions = await voucherDistributionModel.getAllDistributions({
        adminId,
        userId,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      return res.json({
        success: true,
        data: distributions
      });
      
    } catch (error) {
      console.error("[VoucherDistributionController] getDistributions error:", error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new VoucherDistributionController();
