// src/controllers/bookingTableController.js
const bookingTableService = require("../services/bookingTableService");

class BookingTableController {
  // POST /api/booking-tables
  async create(req, res) {
    try {
      const accountId = req.user?.id; // AccountId trong token

      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        receiverId,  // FE phải gửi EntityAccountId của bar
        tables,
        note,
        totalAmount,
        bookingDate,
        startTime,
        endTime,
      } = req.body;

      const result = await bookingTableService.createBarTableBooking({
        bookerAccountId: accountId,
        receiverEntityId: receiverId,
        tables,
        note,
        totalAmount,
        bookingDate,
        startTime,
        endTime,
      });

      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      console.error("create booking table error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking table",
        error: error.message,
      });
    }
  }

  // PATCH /api/booking-tables/:id/confirm
  async confirm(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const result = await bookingTableService.confirmBooking(req.params.id, accountId);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("confirm booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error confirming booking",
        error: error.message,
      });
    }
  }

  // PATCH /api/booking-tables/:id/cancel
  async cancel(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const result = await bookingTableService.cancelBooking(req.params.id, accountId);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("cancel booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error canceling booking",
        error: error.message,
      });
    }
  }

  // GET /api/booking-tables/booker/:bookerId  (nếu bạn muốn dùng id trong path thì bỏ token check)
  async getByBooker(req, res) {
    try {
      const accountId = req.user?.id;
      const result = await bookingTableService.getByBooker(accountId, req.query);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("getByBooker error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings by booker",
        error: error.message,
      });
    }
  }

  // GET /api/booking-tables/receiver/:receiverId
  async getByReceiver(req, res) {
    try {
      const accountId = req.user?.id;
      const result = await bookingTableService.getByReceiver(accountId, req.query);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("getByReceiver error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching bookings by receiver",
        error: error.message,
      });
    }
  }
}

module.exports = new BookingTableController();
