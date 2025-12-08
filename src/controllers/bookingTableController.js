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
        paymentStatus, // "Pending" hoặc "Paid"
        scheduleStatus, // "Pending" hoặc "Confirmed"
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
        paymentStatus: paymentStatus || "Pending", // Mặc định Pending
        scheduleStatus: scheduleStatus || "Confirmed", // Mặc định Confirmed (không cần bar xác nhận)
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
      // receiverId từ params là EntityAccountId của bar
      const receiverId = req.params.receiverId;
      if (!receiverId) {
        return res.status(400).json({
          success: false,
          message: "receiverId is required"
        });
      }

      // Service cần AccountId của bar, nhưng frontend gửi EntityAccountId
      // Cần lấy AccountId từ EntityAccountId
      // Tạm thời, sửa service để nhận EntityAccountId trực tiếp
      const result = await bookingTableService.getByReceiverEntityId(receiverId, req.query);
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

  // PATCH /api/booking-tables/:id/mark-paid - Đánh dấu đã thanh toán
  async markPaid(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const bookedScheduleModel = require("../models/bookedScheduleModel");

      // Cập nhật PaymentStatus thành "Paid"
      const result = await bookedScheduleModel.updateBookedScheduleStatuses(id, {
        paymentStatus: "Paid"
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: result,
        message: "Đã đánh dấu thanh toán"
      });
    } catch (error) {
      console.error("markPaid error:", error);
      return res.status(500).json({
        success: false,
        message: "Error marking booking as paid",
        error: error.message
      });
    }
  }

  // PATCH /api/booking-tables/:id/end - Cập nhật status thành Ended
  async endBooking(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const bookedScheduleModel = require("../models/bookedScheduleModel");

      // Cập nhật ScheduleStatus thành "Ended"
      const result = await bookedScheduleModel.updateBookedScheduleStatuses(id, {
        scheduleStatus: "Ended"
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: result,
        message: "Đã cập nhật trạng thái thành Ended"
      });
    } catch (error) {
      console.error("endBooking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error ending booking",
        error: error.message
      });
    }
  }

  // POST /api/booking-tables/:id/create-payment - Tạo payment link cho table booking (cọc)
  async createPayment(req, res) {
    try {
      const { id } = req.params; // BookedScheduleId
      const { depositAmount } = req.body; // Số tiền cọc (mặc định = số bàn * 100k)
      const payosService = require("../services/payosService");
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getPool, sql } = require("../db/sqlserver");

      // Lấy booking
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Kiểm tra nếu đã thanh toán cọc
      if (booking.PaymentStatus === "Paid") {
        return res.status(400).json({
          success: false,
          message: "Booking deposit already paid"
        });
      }

      // Sử dụng depositAmount từ request hoặc tính từ số bàn (mỗi bàn 100k)
      const deposit = depositAmount || 100000;

      if (deposit <= 0) {
        return res.status(400).json({
          success: false,
          message: "Deposit amount must be greater than 0"
        });
      }

      // Tạo orderCode từ timestamp
      const orderCode = Date.now();

      // Tạo PayOS payment link
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const returnUrl = `${frontendUrl}/payment-return?type=table-booking&bookingId=${id}&orderCode=${orderCode}`;
      const cancelUrl = `${frontendUrl}/customer/newsfeed`;

      // PayOS description tối đa 25 ký tự
      const description = `Coc dat ban`.substring(0, 25);

      const paymentData = {
        amount: parseInt(deposit), // PayOS cần số nguyên (VND) - tiền cọc
        orderCode: orderCode,
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl
      };

      const payosResult = await payosService.createPayment(paymentData);

      // ✅ QUAN TRỌNG: Sử dụng orderCode từ PayOS response
      const actualOrderCode = payosResult.orderCode || orderCode;
      
      console.log("[BookingTableController] Payment link created:", {
        localOrderCode: orderCode,
        payosOrderCode: payosResult.orderCode,
        actualOrderCode: actualOrderCode,
        bookingId: id,
        paymentUrl: payosResult.paymentUrl
      });

      // Lưu orderCode vào database
      const pool = await getPool();
      try {
        // Tạo bảng nếu chưa tồn tại
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BookingPayments')
          BEGIN
            CREATE TABLE BookingPayments (
              Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              BookedScheduleId UNIQUEIDENTIFIER NOT NULL,
              OrderCode BIGINT NOT NULL UNIQUE,
              CreatedAt DATETIME DEFAULT GETDATE(),
              FOREIGN KEY (BookedScheduleId) REFERENCES BookedSchedules(BookedScheduleId)
            );
            CREATE INDEX IX_BookingPayments_OrderCode ON BookingPayments(OrderCode);
          END
        `);
        
        // Insert orderCode mapping
        console.log("[BookingTableController] Saving orderCode mapping to BookingPayments:", {
          bookedScheduleId: id,
          orderCode: actualOrderCode
        });
        
        const insertResult = await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, id)
          .input("OrderCode", sql.BigInt, actualOrderCode)
          .query(`
            INSERT INTO BookingPayments (BookedScheduleId, OrderCode)
            VALUES (@BookedScheduleId, @OrderCode);
          `);
        
        console.log("[BookingTableController] ✅ OrderCode mapping saved successfully:", {
          bookedScheduleId: id,
          orderCode: actualOrderCode,
          rowsAffected: insertResult.rowsAffected
        });
      } catch (dbError) {
        console.error("[BookingTableController] ❌ Error saving orderCode mapping:", dbError);
        // Continue anyway
      }

      return res.status(200).json({
        success: true,
        data: {
          paymentUrl: payosResult.paymentUrl,
          orderCode: payosResult.orderCode,
          bookingId: id
        },
        message: "Payment link created successfully"
      });
    } catch (error) {
      console.error("[BookingTableController] createPayment error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating payment link",
        error: error.message
      });
    }
  }
}

module.exports = new BookingTableController();
