const bookingService = require("../services/bookingService");

class BookingController {
  async createBooking(req, res) {
    try {
      const {
        bookerId,
        receiverId,
        type,
        totalAmount,
        paymentStatus,
        scheduleStatus,
        bookingDate,
        startTime,
        endTime,
        mongoDetailId
      } = req.body;

      if (!bookerId || !receiverId || !type) {
        return res.status(400).json({
          success: false,
          message: "bookerId, receiverId and type are required"
        });
      }

      const bookingData = {
        bookerId,
        receiverId,
        type,
        totalAmount: totalAmount ?? 0,
        paymentStatus: paymentStatus || "Pending",
        scheduleStatus: scheduleStatus || "Pending",
        bookingDate,
        startTime,
        endTime,
        mongoDetailId
      };

      const result = await bookingService.createBooking(bookingData);

      return res.status(201).json({
        success: true,
        data: result,
        message: "Booked schedule created successfully"
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error creating booked schedule",
        error: error.message
      });
    }
  }

  async confirmBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.confirmBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error confirming schedule",
        error: error.message
      });
    }
  }

  async cancelBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.cancelBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error canceling schedule",
        error: error.message
      });
    }
  }

  async rejectBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.rejectBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error rejecting schedule",
        error: error.message
      });
    }
  }

  // GET /api/booking/my - Lấy bookings của user hiện tại (dựa trên token)
  async getMyBookings(req, res) {
    try {
      const userId = req.user?.id;
      const { limit = 50, offset = 0 } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy EntityAccountId của user (Account entity)
      const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");
      const entityAccountId = await getEntityAccountIdByAccountId(userId, "Account");

      if (!entityAccountId) {
        return res.status(200).json({
          success: true,
          data: []
        });
      }

      const result = await bookingService.getBookingsByBooker(entityAccountId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      if (result.success) {
        return res.status(200).json(result);
      }
      return res.status(400).json(result);
    } catch (error) {
      console.error("[BookingController] getMyBookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching my bookings",
        error: error.message
      });
    }
  }

  async getByBooker(req, res) {
    try {
      const { bookerId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!bookerId) {
        return res.status(400).json({ success: false, message: "bookerId is required" });
      }

      const result = await bookingService.getBookingsByBooker(bookerId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      if (result.success) {
        return res.status(200).json(result);
      }
      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error fetching schedules by booker",
        error: error.message
      });
    }
  }

  async getByReceiver(req, res) {
    try {
      const { receiverId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!receiverId) {
        return res.status(400).json({ success: false, message: "receiverId is required" });
      }

      const result = await bookingService.getBookingsByReceiver(receiverId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      if (result.success) {
        return res.status(200).json(result);
      }
      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error fetching schedules by receiver",
        error: error.message
      });
    }
  }

  // POST /api/booking/request - Tạo yêu cầu booking (cần xác nhận)
  async createRequest(req, res) {
    try {
      const {
        requesterEntityAccountId,
        requesterRole,
        performerEntityAccountId,
        performerRole,
        date,
        startTime,
        endTime,
        location,
        note,
        offeredPrice
      } = req.body;

      if (!requesterEntityAccountId || !performerEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "requesterEntityAccountId and performerEntityAccountId are required"
        });
      }

      if (!date || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: "date, startTime and endTime are required"
        });
      }

      // Tạo detailSchedule trong MongoDB cho Location và Note
      const DetailSchedule = require("../models/detailSchedule");
      let mongoDetailId = null;
      
      if (location || note) {
        try {
          const detailDoc = await DetailSchedule.create({
            Location: location || "",
            Note: note || "",
            OfferedPrice: offeredPrice || 0,
            PerformerRole: performerRole,
            RequesterRole: requesterRole || "Customer",
          });
          mongoDetailId = detailDoc._id.toString();
        } catch (error) {
          console.error("[BookingController] Error creating detailSchedule:", error);
          // Continue without detailSchedule if creation fails
        }
      }

      // Tạo booking với status "Pending" (chờ xác nhận)
      const bookingData = {
        bookerId: requesterEntityAccountId,
        receiverId: performerEntityAccountId,
        type: performerRole === "DJ" ? "DJ" : performerRole === "DANCER" ? "DANCER" : "Performer",
        totalAmount: offeredPrice || 0,
        paymentStatus: "Pending",
        scheduleStatus: "Pending", // Chờ xác nhận
        bookingDate: date,
        startTime,
        endTime,
        mongoDetailId
      };

      const result = await bookingService.createBooking(bookingData);

      return res.status(201).json({
        success: true,
        data: result,
        message: "Booking request created successfully. Waiting for confirmation."
      });
    } catch (error) {
      console.error("[BookingController] createRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking request",
        error: error.message
      });
    }
  }

  // POST /api/booking/:id/create-payment - Tạo payment link cho booking (cọc)
  async createPayment(req, res) {
    try {
      const { id } = req.params; // BookedScheduleId
      const { depositAmount } = req.body; // Số tiền cọc (mặc định 100.000)
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

      // Sử dụng depositAmount từ request hoặc mặc định 100.000
      const deposit = depositAmount || 100000;

      if (deposit <= 0) {
        return res.status(400).json({
          success: false,
          message: "Deposit amount must be greater than 0"
        });
      }

      // Tạo orderCode từ timestamp + bookingId hash
      const orderCode = Date.now();

      // Lưu orderCode vào database (dùng một cách tạm thời: lưu vào MongoDetailId hoặc tạo bảng mapping)
      // Để đơn giản, tôi sẽ dùng orderCode để tìm booking sau này
      // Hoặc có thể lưu vào một bảng mapping
      const pool = await getPool();
      // Tạo bảng mapping nếu chưa có (tạm thời dùng một cách khác)
      // Hoặc lưu orderCode vào một field nào đó

      // Tạo PayOS payment link
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const returnUrl = `${frontendUrl}/payment-return?type=booking&bookingId=${id}&orderCode=${orderCode}`;
      const cancelUrl = `${frontendUrl}/customer/newsfeed`;

      // PayOS description tối đa 25 ký tự
      const description = `Coc booking ${booking.Type || 'Performer'}`.substring(0, 25);

      const paymentData = {
        amount: parseInt(deposit), // PayOS cần số nguyên (VND) - chỉ thanh toán cọc
        orderCode: orderCode,
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl
      };

      const payosResult = await payosService.createPayment(paymentData);

      // ✅ QUAN TRỌNG: Sử dụng orderCode từ PayOS response, không phải orderCode local
      const actualOrderCode = payosResult.orderCode || orderCode;
      
      console.log("[BookingController] Payment link created:", {
        localOrderCode: orderCode,
        payosOrderCode: payosResult.orderCode,
        actualOrderCode: actualOrderCode,
        bookingId: id,
        paymentUrl: payosResult.paymentUrl
      });

      // Lưu orderCode vào database để có thể tìm lại booking khi webhook được gọi
      // Tạo bảng mapping nếu chưa có
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
        
        // Insert orderCode mapping - SỬ DỤNG actualOrderCode từ PayOS
        console.log("[BookingController] Saving orderCode mapping to BookingPayments:", {
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
        
        console.log("[BookingController] ✅ OrderCode mapping saved successfully:", {
          bookedScheduleId: id,
          orderCode: actualOrderCode,
          rowsAffected: insertResult.rowsAffected
        });
        
        // Verify bằng cách query lại
        const verifyResult = await pool.request()
          .input("OrderCode", sql.BigInt, actualOrderCode)
          .query(`
            SELECT BookedScheduleId, OrderCode 
            FROM BookingPayments 
            WHERE OrderCode = @OrderCode
          `);
        
        console.log("[BookingController] ✅ Verified orderCode in DB:", {
          orderCode: actualOrderCode,
          found: verifyResult.recordset.length > 0,
          bookingId: verifyResult.recordset[0]?.BookedScheduleId
        });
      } catch (dbError) {
        console.error("[BookingController] ❌ Error saving orderCode mapping:", dbError);
        console.error("[BookingController] Error details:", {
          message: dbError.message,
          stack: dbError.stack,
          code: dbError.code,
          number: dbError.number
        });
        // Continue anyway, có thể tìm booking bằng cách khác
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
      console.error("[BookingController] createPayment error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating payment link",
        error: error.message
      });
    }
  }

  // POST /api/booking/:id/complete-transaction - DJ/Dancer xác nhận đã giao dịch xong
  async completeTransaction(req, res) {
    try {
      const { id } = req.params; // BookedScheduleId
      const userId = req.user?.id;
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy booking
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Kiểm tra quyền - chỉ receiver (DJ/Dancer) mới được xác nhận
      let isAuthorized = false;
      const entityTypes = ["BusinessAccount", "BarPage", "Account"];
      for (const entityType of entityTypes) {
        const entityAccountId = await getEntityAccountIdByAccountId(userId, entityType);
        if (entityAccountId && this._isSameId(booking.ReceiverId, entityAccountId)) {
          isAuthorized = true;
          break;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: "Only the performer (DJ/Dancer) can complete this transaction"
        });
      }

      // Kiểm tra booking đã được confirm chưa
      if (booking.ScheduleStatus !== "Confirmed") {
        return res.status(400).json({
          success: false,
          message: "Booking must be confirmed before completing transaction"
        });
      }

      // Kiểm tra booking đã được thanh toán cọc chưa
      if (booking.PaymentStatus !== "Paid") {
        return res.status(400).json({
          success: false,
          message: "Deposit must be paid before completing transaction"
        });
      }

      // Cập nhật payment status thành "Paid" (đã thanh toán toàn bộ) và schedule status thành "Completed"
      const updatedBooking = await bookedScheduleModel.updateBookedScheduleStatuses(id, {
        paymentStatus: "Paid",
        scheduleStatus: "Completed"
      });

      // Tạo PaymentHistory cho toàn bộ số tiền booking (customer trả toàn bộ cho DJ/Dancer, không trừ cọc)
      const totalAmount = booking.TotalAmount || 0;
      if (totalAmount > 0) {
        const paymentHistoryModel = require("../models/paymentHistoryModel");
        await paymentHistoryModel.createPaymentHistory({
          type: 'booking',
          senderId: booking.BookerId,
          receiverId: booking.ReceiverId, // DJ/Dancer nhận toàn bộ số tiền
          transferContent: `Thanh toán toàn bộ booking ${booking.Type || 'Performer'}`,
          transferAmount: totalAmount // Toàn bộ số tiền, không trừ cọc
        });
      }

      return res.status(200).json({
        success: true,
        data: updatedBooking,
        message: "Transaction completed successfully"
      });
    } catch (error) {
      console.error("[BookingController] completeTransaction error:", error);
      return res.status(500).json({
        success: false,
        message: "Error completing transaction",
        error: error.message
      });
    }
  }

  // GET /api/booking/auto-complete - Tự động complete các booking đã qua 7 ngày
  async autoCompleteBookings(req, res) {
    try {
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();

      // Lấy tất cả bookings đã confirmed và đã thanh toán cọc, chưa complete
      const result = await pool.request().query(`
        SELECT 
          BookedScheduleId,
          EndTime,
          ScheduleStatus,
          PaymentStatus
        FROM BookedSchedules
        WHERE ScheduleStatus = 'Confirmed'
          AND PaymentStatus = 'Paid'
          AND EndTime IS NOT NULL
          AND EndTime <= DATEADD(day, -7, GETDATE())
      `);

      const bookingsToComplete = result.recordset;
      let completedCount = 0;

      for (const booking of bookingsToComplete) {
        try {
          // Cập nhật status thành Completed và Paid
          await bookedScheduleModel.updateBookedScheduleStatuses(booking.BookedScheduleId, {
            scheduleStatus: "Completed",
            paymentStatus: "Paid"
          });

          // Tạo PaymentHistory cho toàn bộ số tiền booking (customer trả toàn bộ cho DJ/Dancer, không trừ cọc)
          const bookingDetail = await bookedScheduleModel.getBookedScheduleById(booking.BookedScheduleId);
          const totalAmount = bookingDetail?.TotalAmount || 0;
          
          if (totalAmount > 0) {
            const paymentHistoryModel = require("../models/paymentHistoryModel");
            await paymentHistoryModel.createPaymentHistory({
              type: 'booking',
              senderId: bookingDetail.BookerId,
              receiverId: bookingDetail.ReceiverId, // DJ/Dancer nhận toàn bộ số tiền
              transferContent: `Tự động thanh toán toàn bộ booking ${bookingDetail.Type || 'Performer'} (sau 7 ngày)`,
              transferAmount: totalAmount // Toàn bộ số tiền, không trừ cọc
            });
          }

          completedCount++;
        } catch (error) {
          console.error(`[BookingController] Error auto-completing booking ${booking.BookedScheduleId}:`, error);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Auto-completed ${completedCount} booking(s)`,
        data: { completedCount }
      });
    } catch (error) {
      console.error("[BookingController] autoCompleteBookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error auto-completing bookings",
        error: error.message
      });
    }
  }

  _isSameId(id1, id2) {
    if (!id1 || !id2) return false;
    return id1.toString().toLowerCase() === id2.toString().toLowerCase();
  }

  // POST /api/booking/:id/check-payment - Kiểm tra và cập nhật payment status từ PayOS
  async checkAndUpdatePaymentStatus(req, res) {
    try {
      const { id } = req.params; // BookedScheduleId
      const payosService = require("../services/payosService");
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getPool, sql } = require("../db/sqlserver");
      
      console.log("[BookingController] checkAndUpdatePaymentStatus called for bookingId:", id);
      
      // Lấy booking
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        console.error("[BookingController] ❌ Booking not found:", id);
        return res.status(404).json({ 
          success: false, 
          message: "Booking not found" 
        });
      }
      
      console.log("[BookingController] Current booking status:", {
        bookedScheduleId: booking.BookedScheduleId,
        paymentStatus: booking.PaymentStatus,
        scheduleStatus: booking.ScheduleStatus
      });
      
      // Nếu đã Paid rồi thì không cần check
      if (booking.PaymentStatus === "Paid") {
        console.log("[BookingController] ✅ Payment status is already Paid");
        return res.status(200).json({
          success: true,
          message: "Payment status is already Paid",
          paymentStatus: "Paid"
        });
      }
      
      // Lấy orderCode từ BookingPayments
      const pool = await getPool();
      const paymentResult = await pool.request()
        .input("BookedScheduleId", sql.UniqueIdentifier, id)
        .query(`
          SELECT OrderCode, CreatedAt
          FROM BookingPayments 
          WHERE BookedScheduleId = @BookedScheduleId
          ORDER BY CreatedAt DESC
        `);
      
      if (paymentResult.recordset.length === 0) {
        console.error("[BookingController] ❌ OrderCode not found for booking:", id);
        return res.status(404).json({ 
          success: false, 
          message: "OrderCode not found for this booking" 
        });
      }
      
      const orderCode = paymentResult.recordset[0].OrderCode;
      console.log("[BookingController] Found orderCode:", orderCode.toString());
      
      // Check payment status từ PayOS
      console.log("[BookingController] Checking payment status from PayOS...");
      const paymentInfo = await payosService.getPaymentInfo(parseInt(orderCode.toString()));
      
      console.log("[BookingController] PayOS payment info:", {
        orderCode: orderCode.toString(),
        status: paymentInfo.data?.status,
        amount: paymentInfo.data?.amount
      });
      
      if (paymentInfo.data?.status === "PAID" && booking.PaymentStatus !== "Paid") {
        console.log("[BookingController] ✅ Payment is PAID on PayOS, updating booking status...");
        
        // Gọi handleBookingPayment để update
        const payosController = require("./payosController");
        const processedData = {
          orderCode: orderCode.toString(),
          status: "PAID",
          amount: paymentInfo.data?.amount || 0
        };
        
        await payosController.handleBookingPayment(id, processedData);
        
        // Verify lại sau khi update
        const updatedBooking = await bookedScheduleModel.getBookedScheduleById(id);
        
        console.log("[BookingController] ✅ Payment status updated successfully:", {
          previousStatus: booking.PaymentStatus,
          newStatus: updatedBooking?.PaymentStatus
        });
        
        return res.status(200).json({
          success: true,
          message: "Payment status updated to Paid",
          paymentStatus: updatedBooking?.PaymentStatus || "Paid",
          previousStatus: booking.PaymentStatus,
          paymentAmount: paymentInfo.data?.amount || 0 // Trả về số tiền đã thanh toán từ PayOS
        });
      }
      
      // Nếu chưa PAID trên PayOS
      console.log("[BookingController] Payment status on PayOS:", paymentInfo.data?.status);
      return res.status(200).json({
        success: true,
        message: "Payment status checked",
        paymentStatus: booking.PaymentStatus,
        payosStatus: paymentInfo.data?.status || "UNKNOWN",
        needsUpdate: false,
        paymentAmount: paymentInfo.data?.amount || 0 // Trả về số tiền từ PayOS
      });
    } catch (error) {
      console.error("[BookingController] checkAndUpdatePaymentStatus error:", error);
      console.error("[BookingController] Error stack:", error.stack);
      return res.status(500).json({
        success: false,
        message: "Error checking payment status",
        error: error.message
      });
    }
  }
}

module.exports = new BookingController();
