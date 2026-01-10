// src/controllers/adminComboController.js
const comboModel = require("../models/comboModel");

class AdminComboController {
  // GET /api/admin/combos - Lấy danh sách combos
  async getCombos(req, res) {
    try {
      const { barId, status, limit = 50, offset = 0 } = req.query;

      // Nếu có barId, lấy combos của bar đó
      if (barId) {
        const combos = await comboModel.getCombosByBarId(barId);
        return res.status(200).json({
          success: true,
          data: combos
        });
      }

      // Lấy tất cả combos (admin only)
      // Note: Cần implement getAllCombos function nếu cần
      const combos = await comboModel.getPopularCombos(parseInt(limit));

      return res.status(200).json({
        success: true,
        data: combos
      });
    } catch (error) {
      console.error("getCombos error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching combos",
        error: error.message
      });
    }
  }

  // GET /api/admin/combos/:id - Lấy combo theo ID
  async getComboById(req, res) {
    try {
      const { id } = req.params;
      const combo = await comboModel.getComboById(id);

      if (!combo) {
        return res.status(404).json({
          success: false,
          message: "Combo not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: combo
      });
    } catch (error) {
      console.error("getComboById error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching combo",
        error: error.message
      });
    }
  }

  // POST /api/admin/combos - Tạo combo mới
  async createCombo(req, res) {
    try {
      const {
        comboName,
        barId,
        price,
        description
      } = req.body;

      // Validate required fields
      if (!comboName || !barId || !price) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: comboName, barId, price"
        });
      }

      // Validate price
      if (price < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be non-negative"
        });
      }

      const combo = await comboModel.createCombo({
        comboName,
        barId,
        price,
        description
      });

      return res.status(201).json({
        success: true,
        data: combo,
        message: "Combo created successfully"
      });
    } catch (error) {
      console.error("createCombo error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating combo",
        error: error.message
      });
    }
  }

  // PUT /api/admin/combos/:id - Cập nhật combo
  async updateCombo(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate price if provided
      if (updates.price !== undefined && updates.price < 0) {
        return res.status(400).json({
          success: false,
          message: "Price must be non-negative"
        });
      }

      // Check if combo exists
      const existingCombo = await comboModel.getComboById(id);
      if (!existingCombo) {
        return res.status(404).json({
          success: false,
          message: "Combo not found"
        });
      }

      const updatedCombo = await comboModel.updateCombo(id, updates);

      return res.status(200).json({
        success: true,
        data: updatedCombo,
        message: "Combo updated successfully"
      });
    } catch (error) {
      console.error("updateCombo error:", error);
      return res.status(500).json({
        success: false,
        message: "Error updating combo",
        error: error.message
      });
    }
  }

  // DELETE /api/admin/combos/:id - Xóa combo (soft delete)
  async deleteCombo(req, res) {
    try {
      const { id } = req.params;

      // Check if combo exists
      const combo = await comboModel.getComboById(id);
      if (!combo) {
        return res.status(404).json({
          success: false,
          message: "Combo not found"
        });
      }

      // Check if combo is being used in active bookings
      // (Có thể check trong BookedSchedules nếu cần)

      const deletedCombo = await comboModel.deleteCombo(id);

      return res.status(200).json({
        success: true,
        data: deletedCombo,
        message: "Combo deleted successfully"
      });
    } catch (error) {
      console.error("deleteCombo error:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting combo",
        error: error.message
      });
    }
  }

  // GET /api/admin/combos/stats - Thống kê combo
  async getComboStats(req, res) {
    try {
      const { barId } = req.query;

      // Tổng số combos
      const totalCombos = barId
        ? await comboModel.countCombosByBarId(barId)
        : 0; // Cần implement countAllCombos nếu cần

      // Combos phổ biến
      const popularCombos = await comboModel.getPopularCombos(10);

      // Thống kê booking theo combo
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();

      let statsQuery = `
        SELECT
          c.ComboId,
          c.ComboName,
          c.Price,
          COUNT(bs.BookedScheduleId) as BookingCount,
          SUM(bs.TotalAmount) as TotalRevenue,
          SUM(bs.OriginalPrice) as TotalOriginalRevenue,
          SUM(bs.OriginalPrice - bs.TotalAmount) as TotalDiscountAmount
        FROM Combos c
        -- DB hiện tại không có bs.ComboId, nên không join được BookedSchedules theo combo
        LEFT JOIN BookedSchedules bs ON 1 = 0
      `;

      if (barId) {
        statsQuery += " AND c.BarId = @barId";
      }

      statsQuery += `
        GROUP BY c.ComboId, c.ComboName, c.Price
        ORDER BY COUNT(bs.BookedScheduleId) DESC
      `;

      const request = pool.request();
      if (barId) request.input("barId", sql.UniqueIdentifier, barId);

      const comboStats = await request.query(statsQuery);

      return res.status(200).json({
        success: true,
        data: {
          summary: {
            totalCombos,
            totalBookings: comboStats.recordset.reduce((sum, combo) => sum + combo.BookingCount, 0),
            totalRevenue: comboStats.recordset.reduce((sum, combo) => sum + (combo.TotalRevenue || 0), 0)
          },
          popularCombos,
          comboPerformance: comboStats.recordset
        }
      });
    } catch (error) {
      console.error("getComboStats error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching combo stats",
        error: error.message
      });
    }
  }
}

module.exports = new AdminComboController();
