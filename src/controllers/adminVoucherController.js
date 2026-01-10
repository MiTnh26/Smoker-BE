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
        StartDate: voucher.StartDate ? new Date(voucher.StartDate).toISOString().split('T')[0] : null,
        EndDate: voucher.EndDate ? new Date(voucher.EndDate).toISOString().split('T')[0] : null,
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
        discountPercentage,
        maxUsage,
        minComboValue = 1000000,
        startDate,
        endDate,
        status = "ACTIVE"
      } = req.body;

      console.log('🔍 Validation step 1 - Required fields check');
      // Validate required fields
      if (!voucherName || !voucherCode || discountPercentage == null || !maxUsage || !startDate || !endDate) {
        console.log('❌ Missing required fields');
        return res.status(400).json({
          success: false,
          message: "Missing required fields: voucherName, voucherCode, discountPercentage, maxUsage, startDate, endDate"
        });
      }
      console.log('✅ Required fields OK');

      console.log('🔍 Validation step 2 - Discount percentage check');
      // Validate discount percentage (3-5%)
      if (discountPercentage < 3 || discountPercentage > 5) {
        console.log('❌ Invalid discount percentage:', discountPercentage);
        return res.status(400).json({
          success: false,
          message: "Discount percentage must be between 3 and 5"
        });
      }
      console.log('✅ Discount percentage OK');

      console.log('🔍 Validation step 3 - Min combo value check');
      // Validate min combo value
      if (minComboValue < 1000000) {
        console.log('❌ Invalid min combo value:', minComboValue);
        return res.status(400).json({
          success: false,
          message: "Minimum combo value must be at least 1,000,000 VND"
        });
      }
      console.log('✅ Min combo value OK');

      console.log('🔍 Validation step 4 - Check duplicate voucher code');
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
        discountPercentage,
        maxUsage,
        minComboValue,
        startDate,
        endDate,
        status
      });

      console.log('🔍 Voucher created successfully:', voucher);

      // Format dates for JSON response - ensure all dates are serializable
      const formattedVoucher = {
        ...voucher,
        StartDate: voucher.StartDate ? new Date(voucher.StartDate).toISOString().split('T')[0] : null,
        EndDate: voucher.EndDate ? new Date(voucher.EndDate).toISOString().split('T')[0] : null,
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

      // Validate discount percentage if provided
      if (updates.discountPercentage !== undefined) {
        if (updates.discountPercentage < 3 || updates.discountPercentage > 5) {
          return res.status(400).json({
            success: false,
            message: "Discount percentage must be between 3 and 5"
          });
        }
      }

      // Validate min combo value if provided
      if (updates.minComboValue !== undefined && updates.minComboValue < 1000000) {
        return res.status(400).json({
          success: false,
          message: "Minimum combo value must be at least 1,000,000 VND"
        });
      }

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
}

module.exports = new AdminVoucherController();
