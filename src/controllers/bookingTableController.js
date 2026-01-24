// src/controllers/bookingTableController.js
const bookingTableService = require("../services/bookingTableService");
const qrService = require("../services/qrService");

class BookingTableController {
  constructor() {
    // Bind methods that reference `this` so they work when passed as route handlers
    this.createPayment = this.createPayment.bind(this);
    this.getPaymentLink = this.getPaymentLink.bind(this);
    this.createFullPayment = this.createFullPayment.bind(this);
    this.getFullPaymentLink = this.getFullPaymentLink.bind(this);
  }

  /**
   * Tạo booking với voucher mới (luồng mới)
   * POST /api/booking-tables/with-voucher
   * Body: { receiverId, tableId, voucherId, salePrice, bookingDate, startTime, endTime, note }
   */
  async createWithVoucher(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        receiverId,    // EntityAccountId của bar
        tableId,       // ID bàn
        voucherId,     // VoucherId từ bar (optional - nếu không có thì chỉ đặt bàn với cọc 100k)
        salePrice,     // Giá admin bán voucher (optional - chỉ cần khi có voucher)
        bookingDate,
        startTime,
        endTime,
        note
      } = req.body;

      if (!receiverId || !tableId) {
        return res.status(400).json({
          success: false,
          message: "receiverId và tableId là bắt buộc"
        });
      }

      // Nếu có voucher thì phải có salePrice
      if (voucherId && !salePrice) {
        return res.status(400).json({
          success: false,
          message: "salePrice là bắt buộc khi có voucherId"
        });
      }

      const result = await bookingTableService.createBookingWithVoucher({
        bookerAccountId: accountId,
        receiverEntityId: receiverId,
        tableId,
        voucherId,
        salePrice,
        bookingDate,
        startTime,
        endTime,
        note
      });

      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      console.error("createWithVoucher booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking with voucher",
        error: error.message,
      });
    }
  }

  // POST /api/booking-tables - Tạo booking với combo bắt buộc (API mới)
  async createWithCombo(req, res) {
    try {
      const accountId = req.user?.id; // AccountId trong token

      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        receiverId,    // EntityAccountId của bar
        comboId,       // ID combo bắt buộc
        voucherCode,   // Voucher code (optional)
        tableId,       // ID bàn được chọn
        bookingDate,
        startTime,
        endTime,
        note
      } = req.body;

      // Validate required fields
      if (!comboId || !tableId) {
        return res.status(400).json({
          success: false,
          message: "comboId và tableId là bắt buộc"
        });
      }

      const result = await bookingTableService.createBarTableBookingWithCombo({
        bookerAccountId: accountId,
        receiverEntityId: receiverId,
        comboId,
        voucherCode,
        tableId,
        bookingDate,
        startTime,
        endTime,
        note
      });

      return res.status(result.success ? 201 : 400).json(result);
    } catch (error) {
      console.error("createWithCombo booking table error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking table with combo",
        error: error.message,
      });
    }
  }

  // POST /api/booking-tables - API cũ (backward compatibility)
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
        paymentStatus: paymentStatus || "Pending",
        scheduleStatus: "Pending",
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

  // POST /api/booking-tables/confirm-by-qr - Xác nhận bằng QR code
  async confirmByQR(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { qrData } = req.body;
      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: "qrData is required"
        });
      }

      const result = await bookingTableService.confirmBookingByQR(qrData, accountId);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("confirm by QR error:", error);
      return res.status(500).json({
        success: false,
        message: "Error confirming booking by QR",
        error: error.message,
      });
    }
  }

  // PATCH /api/booking-tables/:id/confirm - Xác nhận thủ công (fallback)
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

  // POST /api/booking-tables/:id/request-refund - Yêu cầu hoàn tiền
  async requestRefund(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const { reason, evidenceUrls } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: "Cần cung cấp lý do hoàn tiền"
        });
      }

      const result = await bookingTableService.requestRefund(id, accountId, reason, evidenceUrls);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("request refund error:", error);
      return res.status(500).json({
        success: false,
        message: "Error requesting refund",
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

  // PATCH /api/booking-tables/:id/mark-arrived - Đánh dấu khách đã tới quán (thủ công)
  async markArrived(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const bookedScheduleModel = require("../models/bookedScheduleModel");

      // Kiểm tra quyền: chỉ bar owner mới có thể mark arrived
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");
      if (!barEntityId) {
        return res.status(403).json({
          success: false,
          message: "Chỉ quán bar mới có thể đánh dấu khách đã tới"
        });
      }

      // Kiểm tra booking tồn tại và thuộc về bar này
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      if (booking.ReceiverId.toLowerCase() !== barEntityId.toLowerCase()) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền đánh dấu booking này"
        });
      }

      // Chỉ có thể mark arrived từ Confirmed status
      const currentStatus = booking.ScheduleStatus || booking.scheduleStatus;
      if (currentStatus !== 'Confirmed') {
        return res.status(400).json({
          success: false,
          message: `Chỉ có thể đánh dấu 'Đã tới quán' từ trạng thái 'Confirmed'. Trạng thái hiện tại: ${currentStatus}`
        });
      }

      // Cập nhật ScheduleStatus thành "Arrived"
      const result = await bookedScheduleModel.updateBookedScheduleStatuses(id, {
        scheduleStatus: "Arrived"
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
        message: "Đã đánh dấu khách đã tới quán"
      });
    } catch (error) {
      console.error("markArrived error:", error);
      return res.status(500).json({
        success: false,
        message: "Error marking booking as arrived",
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

      // Kiểm tra quyền: chỉ bar owner hoặc admin mới có thể end booking
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Bar owner hoặc admin có thể end
      if (barEntityId && booking.ReceiverId.toLowerCase() !== barEntityId.toLowerCase()) {
        return res.status(403).json({
          success: false,
          message: "Bạn không có quyền kết thúc booking này"
        });
      }

      // Chỉ có thể end từ Arrived hoặc Confirmed status
      const currentStatus = booking.ScheduleStatus || booking.scheduleStatus;
      if (currentStatus !== 'Arrived' && currentStatus !== 'Confirmed') {
        return res.status(400).json({
          success: false,
          message: `Chỉ có thể kết thúc booking từ trạng thái 'Arrived' hoặc 'Confirmed'. Trạng thái hiện tại: ${currentStatus}`
        });
      }

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

  // POST /api/booking-tables/:id/create-full-payment - Tạo payment link cho toàn bộ combo
  async createFullPayment(req, res) {
    try {
      const { id } = req.params; // BookedScheduleId
      const payosService = require("../services/payosService");
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getPool, sql } = require("../db/sqlserver");

      // Lấy booking với thông tin combo
      const booking = await bookedScheduleModel.getBookedScheduleWithDetails(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Kiểm tra nếu đã thanh toán
      if (booking.PaymentStatus === "Paid") {
        return res.status(400).json({
          success: false,
          message: "Booking đã được thanh toán"
        });
      }

      // FE có thể truyền số tiền sau giảm + discount% để đảm bảo PayOS đúng ngay
      const requestedAmount = req.body?.amount ?? req.body?.paymentAmount ?? req.body?.depositAmount;
      const requestedDiscount = req.body?.discountPercentages;

      // Nếu có dữ liệu từ FE thì update lại booking amounts trước khi tạo PayOS link
      if (requestedAmount !== undefined || requestedDiscount !== undefined) {
        const safeAmount = requestedAmount !== undefined ? parseInt(requestedAmount) : undefined;
        const safeDiscount = requestedDiscount !== undefined ? parseInt(requestedDiscount) : undefined;

        // guard cơ bản
        if (safeAmount !== undefined && (!Number.isFinite(safeAmount) || safeAmount < 0)) {
          return res.status(400).json({ success: false, message: "Invalid amount" });
        }
        if (safeDiscount !== undefined && (!Number.isFinite(safeDiscount) || safeDiscount < 0 || safeDiscount > 5)) {
          return res.status(400).json({ success: false, message: "Invalid discountPercentages" });
        }

        try {
          await bookedScheduleModel.updateBookingAmounts(id, {
            totalAmount: safeAmount,
            discountPercentages: safeDiscount
          });
          // Reload booking để dùng số tiền mới nhất
          booking.TotalAmount = safeAmount !== undefined ? safeAmount : booking.TotalAmount;
          booking.DiscountPercentages = safeDiscount !== undefined ? safeDiscount : booking.DiscountPercentages;
        } catch (e) {
          console.warn("[BookingTableController] updateBookingAmounts failed:", e.message);
        }
      }

      // Lấy số tiền cần thanh toán (đã tính voucher)
      const paymentAmount = requestedAmount !== undefined ? parseInt(requestedAmount) : booking.TotalAmount;
      if (!paymentAmount || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment amount"
        });
      }

      // Tạo orderCode từ timestamp
      const orderCode = Date.now();

      // Tạo PayOS payment link
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const returnUrl = `${frontendUrl}/payment-return?type=table-booking&bookingId=${id}&orderCode=${orderCode}`;
      const cancelUrl = `${frontendUrl}/customer/newsfeed`;

      // PayOS description tối đa 25 ký tự
      const comboName = booking.ComboName || "Combo";
      const description = `Combo ${comboName}`.substring(0, 25);

      const paymentData = {
        amount: parseInt(paymentAmount), // Toàn bộ tiền combo sau khi áp dụng voucher
        orderCode: orderCode,
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl
      };

      const payosResult = await payosService.createPayment(paymentData);
      const actualOrderCode = payosResult.orderCode || orderCode;
      
      console.log("[BookingTableController] Full payment link created:", {
        bookingId: id,
        comboName: booking.ComboName,
        originalPrice: booking.OriginalPrice,
          discountAmount: Math.max(0, Number(booking.OriginalPrice || 0) - Number(booking.TotalAmount || 0)),
        finalAmount: paymentAmount,
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
        const insertResult = await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, id)
          .input("OrderCode", sql.BigInt, actualOrderCode)
          .query(`
            INSERT INTO BookingPayments (BookedScheduleId, OrderCode)
            VALUES (@BookedScheduleId, @OrderCode);
          `);
        
        console.log("[BookingTableController] ✅ OrderCode mapping saved:", {
          bookedScheduleId: id,
          orderCode: actualOrderCode
        });
      } catch (dbError) {
        console.error("[BookingTableController] ❌ Error saving orderCode:", dbError);
      }

      return res.status(200).json({
        success: true,
        data: {
          paymentUrl: payosResult.paymentUrl,
          orderCode: actualOrderCode,
          bookingId: id,
          amount: paymentAmount,
          comboName: booking.ComboName,
          discountAmount: Math.max(0, Number(booking.OriginalPrice || 0) - Number(booking.TotalAmount || 0))
        },
        message: "Payment link for full combo created successfully"
      });
    } catch (error) {
      console.error("[BookingTableController] createFullPayment error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating full payment link",
        error: error.message
      });
    }
  }

  // POST /api/booking-tables/:id/create-payment - API cũ (backward compatibility)
  async createPayment(req, res) {
    console.warn("⚠️ DEPRECATED: createPayment is deprecated. Use createFullPayment instead.");
    return this.createFullPayment(req, res);
  }

  // GET /api/booking-tables/:id/get-full-payment-link - Lấy payment link cho combo
  async getFullPaymentLink(req, res) {
    try {
      const { id } = req.params;
      const payosService = require("../services/payosService");
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const { getPool, sql } = require("../db/sqlserver");

      // Lấy booking với thông tin combo
      const booking = await bookedScheduleModel.getBookedScheduleWithDetails(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Kiểm tra nếu đã thanh toán
      if (booking.PaymentStatus === "Paid") {
        return res.status(400).json({
          success: false,
          message: "Booking đã được thanh toán"
        });
      }

      const pool = await getPool();
      
      // Kiểm tra xem có orderCode trong BookingPayments không
      let existingOrderCode = null;
      try {
        const orderCodeResult = await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, id)
          .query(`
            SELECT TOP 1 OrderCode 
            FROM BookingPayments 
            WHERE BookedScheduleId = @BookedScheduleId
            ORDER BY CreatedAt DESC
          `);
        
        if (orderCodeResult.recordset.length > 0) {
          existingOrderCode = orderCodeResult.recordset[0].OrderCode;
          console.log("[BookingTableController] Found existing orderCode:", existingOrderCode);
          
          // Thử lấy paymentUrl từ PayOS
          try {
            const paymentInfo = await payosService.getPaymentInfo(existingOrderCode);
            if (paymentInfo.success && paymentInfo.data) {
              const paymentData = paymentInfo.data;
              const status = paymentData.status || paymentData.Status;
              
              // Nếu payment link còn hợp lệ (chưa thanh toán), trả về paymentUrl
              if (status !== "PAID" && status !== "paid" && paymentData.checkoutUrl) {
                console.log("[BookingTableController] Reusing existing payment link");
                return res.status(200).json({
                  success: true,
                  data: {
                    paymentUrl: paymentData.checkoutUrl || paymentData.paymentUrl,
                    orderCode: existingOrderCode,
                    bookingId: id,
                    amount: booking.TotalAmount,
                    comboName: booking.ComboName
                  },
                  message: "Payment link retrieved successfully"
                });
              }
            }
          } catch (payosError) {
            console.log("[BookingTableController] Cannot reuse payment link:", payosError.message);
          }
        }
      } catch (dbError) {
        console.error("[BookingTableController] Error checking existing orderCode:", dbError);
      }

      // Nếu không có orderCode hoặc payment link đã hết hạn, tạo mới
      const paymentAmount = booking.TotalAmount;

      // Tạo orderCode mới
      const orderCode = Date.now();

      // Tạo PayOS payment link
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const returnUrl = `${frontendUrl}/payment-return?type=table-booking&bookingId=${id}&orderCode=${orderCode}`;
      const cancelUrl = `${frontendUrl}/customer/newsfeed`;

      const comboName = booking.ComboName || "Combo";
      const description = `Combo ${comboName}`.substring(0, 25);

      const paymentData = {
        amount: parseInt(paymentAmount),
        orderCode: orderCode,
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl
      };

      const payosResult = await payosService.createPayment(paymentData);
      const actualOrderCode = payosResult.orderCode || orderCode;

      // Lưu orderCode mới vào database
      try {
        await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, id)
          .input("OrderCode", sql.BigInt, actualOrderCode)
          .query(`
            INSERT INTO BookingPayments (BookedScheduleId, OrderCode)
            VALUES (@BookedScheduleId, @OrderCode)
          `);
      } catch (dbError) {
        console.error("[BookingTableController] Error saving orderCode:", dbError);
      }

      return res.status(200).json({
        success: true,
        data: {
          paymentUrl: payosResult.paymentUrl,
          orderCode: actualOrderCode,
          bookingId: id,
          amount: paymentAmount,
          comboName: booking.ComboName
        },
        message: "Full payment link created successfully"
      });
    } catch (error) {
      console.error("[BookingTableController] getFullPaymentLink error:", error);
      return res.status(500).json({
        success: false,
        message: "Error getting full payment link",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/:id/get-payment-link - API cũ (backward compatibility)
  async getPaymentLink(req, res) {
    console.warn("⚠️ DEPRECATED: getPaymentLink is deprecated. Use getFullPaymentLink instead.");
    return this.getFullPaymentLink(req, res);
  }

  // GET /api/booking-tables/bar/:barId/available-combos - Lấy combos available
  async getAvailableCombos(req, res) {
    try {
      const { barId } = req.params;
      const result = await bookingTableService.getAvailableCombosByBar(barId);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("getAvailableCombos error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching available combos",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/available-vouchers - Lấy vouchers available theo bar
  async getAvailableVouchers(req, res) {
    try {
      const { minComboValue, barPageId } = req.query;
      console.log('[getAvailableVouchers Controller] barPageId:', barPageId, 'minComboValue:', minComboValue);

      if (!barPageId) {
        return res.status(400).json({
          success: false,
          message: "barPageId là bắt buộc"
        });
      }

      // DEBUG: Kiểm tra voucher cụ thể
      console.log('[DEBUG] Checking voucher for barPageId:', barPageId);
      const voucherModel = require("../models/voucherModel");
      const allVouchers = await voucherModel.getVouchersByBarPageId(barPageId);
      console.log('[DEBUG] All vouchers for this bar:', allVouchers);

      // Check specific voucher
      const specificVoucher = allVouchers.find(v => v.VoucherId === '90D35A9F-5D71-4194-84AE-71936CA2A2BB');
      if (specificVoucher) {
        console.log('[DEBUG] Found specific voucher:', specificVoucher);
      } else {
        console.log('[DEBUG] Specific voucher not found for this barPageId');
      }

      // Nếu minComboValue = 0, sẽ lấy tất cả voucher
      const result = await bookingTableService.getAvailableVouchersByBarPageId(
        barPageId,
        minComboValue !== undefined ? parseInt(minComboValue) : 0
      );
      console.log('[getAvailableVouchers Controller] Result:', result);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("getAvailableVouchers error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching available vouchers",
        error: error.message
      });
    }
  }

  // Debug endpoint: GET /api/booking-tables/debug-entity-mapping?entityAccountId=...
  async debugEntityMapping(req, res) {
    try {
      const { entityAccountId } = req.query;
      console.log('[debugEntityMapping] Testing entityAccountId:', entityAccountId);

      const { getBarPageIdByEntityAccountId } = require("../models/barPageModel");
      const barPageInfo = await getBarPageIdByEntityAccountId(entityAccountId);

      console.log('[debugEntityMapping] BarPageInfo result:', barPageInfo);

      if (!barPageInfo) {
        return res.json({
          success: false,
          message: 'No BarPage found for this EntityAccountId',
          entityAccountId
        });
      }

      // Test lấy vouchers
      const voucherModel = require("../models/voucherModel");
      const vouchers = await voucherModel.getVouchersByBarPageId(barPageInfo.BarPageId);
      console.log('[debugEntityMapping] Vouchers found:', vouchers.length);

      return res.json({
        success: true,
        entityAccountId,
        barPageId: barPageInfo.BarPageId,
        barName: barPageInfo.BarName,
        vouchersCount: vouchers.length,
        vouchers: vouchers
      });
    } catch (error) {
      console.error('[debugEntityMapping] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // POST /api/booking-tables/validate-booking-data - Validate combo và voucher
  async validateBookingData(req, res) {
    try {
      const { comboId, voucherCode, barId } = req.body;
      const result = await bookingTableService.validateBookingData({
        comboId, voucherCode, barId
      });
      return res.status(result.valid ? 200 : 400).json(result);
    } catch (error) {
      console.error("validateBookingData error:", error);
      return res.status(500).json({
        success: false,
        message: "Error validating booking data",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/:id/qr-code - Lấy QR code cho người dùng xem
  async getBookingQRCode(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const bookedScheduleModel = require("../models/bookedScheduleModel");

      // Kiểm tra quyền: chỉ người đặt hoặc bar mới xem được QR
      const booking = await bookedScheduleModel.getBookedScheduleWithDetails(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Check if user is the booker or bar owner
      const bookerEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "Account");
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");

      const isBooker = bookerEntityId && booking.BookerId === bookerEntityId;
      const isBarOwner = barEntityId && booking.ReceiverId === barEntityId;

      if (!isBooker && !isBarOwner) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền xem QR code của booking này"
        });
      }

      // Kiểm tra booking đã thanh toán
      // Backward-compat: một số luồng cũ set PaymentStatus='Done'
      if (booking.PaymentStatus !== 'Paid' && booking.PaymentStatus !== 'Done') {
        return res.status(400).json({
          success: false,
          message: "Booking chưa được thanh toán"
        });
      }

      // Nếu chưa có QR code, tạo mới
      const DetailSchedule = require("../models/detailSchedule");
      let detailScheduleDoc = null;
      if (booking.MongoDetailId) {
        detailScheduleDoc = await DetailSchedule.findById(booking.MongoDetailId);
      }

      // Nếu chưa có QR code trong Mongo, tạo mới và lưu vào Mongo
      if (!detailScheduleDoc?.QRCode) {
        const qrService = require("../services/qrService");
        const qrCode = await qrService.generateBookingQR(id, booking);
        if (detailScheduleDoc) {
          detailScheduleDoc.QRCode = qrCode;
          await detailScheduleDoc.save();
        }
      }

      // Lấy comboName và barName từ DetailSchedule nếu booking không có
      const comboName = booking.ComboName || detailScheduleDoc?.Combo?.ComboName || "N/A";
      const barName = booking.BarName || "N/A";

      return res.status(200).json({
        success: true,
        data: {
          bookingId: id,
          qrCode: detailScheduleDoc?.QRCode || null,
          bookingDetails: {
            comboName: comboName,
            barName: barName,
            bookingDate: booking.BookingDate,
            amount: booking.TotalAmount,
            status: booking.ScheduleStatus,
            confirmedAt: null
          }
        }
      });
    } catch (error) {
      console.error("getBookingQRCode error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching QR code",
        error: error.message
      });
    }
  }

  // POST /api/booking-tables/scan-qr - Bar scan QR code để confirm
  async scanQRCode(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { qrData } = req.body;
      if (!qrData) {
        return res.status(400).json({
          success: false,
          message: "qrData is required"
        });
      }

      // Get bar entity ID
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");
      if (!barEntityId) {
        return res.status(403).json({
          success: false,
          message: "Chỉ quán bar mới có thể scan QR code"
        });
      }

      const result = await qrService.validateAndConfirmBooking(qrData, barEntityId);

      if (!result.valid) {
        return res.status(result.alreadyConfirmed ? 200 : 400).json({
          success: result.valid,
          message: result.reason,
          data: result
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          bookingId: result.booking.BookedScheduleId,
          confirmedAt: result.confirmedAt,
          newStatus: result.newStatus || result.booking.ScheduleStatus,
          customerName: result.booking.BookerName,
          comboName: result.booking.ComboName,
          amount: result.booking.TotalAmount
        },
        redirectTo: `/bar/bookings/${result.booking.BookedScheduleId}` // Redirect to booking details
      });
    } catch (error) {
      console.error("scanQRCode error:", error);
      return res.status(500).json({
        success: false,
        message: "Error scanning QR code",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/bar/:barId/confirmed - Lấy bookings đã confirm cho bar management
  async getConfirmedBookingsByBar(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { barId } = req.params;
      const { limit = 50, offset = 0, date } = req.query;

      // Verify bar ownership
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");
      if (!barEntityId) {
        return res.status(403).json({
          success: false,
          message: "Chỉ quán bar mới có thể xem danh sách này"
        });
      }

      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const data = await bookedScheduleModel.getBookedSchedulesByReceiver(barEntityId, { limit: parseInt(limit), offset: parseInt(offset), date });

      // Filter only confirmed bookings (DB không có ConfirmedAt)
      const confirmedBookings = data.filter(booking => (booking.ScheduleStatus || booking.scheduleStatus) === 'Confirmed');

      // Populate combo details
      const bookingsWithDetails = await Promise.all(
        confirmedBookings.map(async (booking) => {
          const bookingDetails = await bookedScheduleModel.getBookedScheduleWithDetails(booking.BookedScheduleId);
          return bookingDetails;
        })
      );

      return res.status(200).json({
        success: true,
        data: bookingsWithDetails,
        pagination: {
          total: confirmedBookings.length,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error("getConfirmedBookingsByBar error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching confirmed bookings",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/:id - Lấy chi tiết booking theo ID
  async getById(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { id } = req.params;
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const DetailSchedule = require("../models/detailSchedule");

      // Lấy booking từ SQL
      const booking = await bookedScheduleModel.getBookedScheduleWithDetails(id);
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found"
        });
      }

      // Kiểm tra quyền: chỉ booker hoặc bar owner mới xem được
      const bookerEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "Account");
      const barEntityId = await require("../models/entityAccount1Model").getEntityAccountIdByAccountId(accountId, "BarPage");

      const isBooker = bookerEntityId && booking.BookerId.toLowerCase() === bookerEntityId.toLowerCase();
      const isBarOwner = barEntityId && booking.ReceiverId.toLowerCase() === barEntityId.toLowerCase();

      if (!isBooker && !isBarOwner) {
        return res.status(403).json({
          success: false,
          message: "Không có quyền xem booking này"
        });
      }

      // Lấy detailSchedule từ MongoDB nếu có
      let detailSchedule = null;
      if (booking.MongoDetailId) {
        try {
          detailSchedule = await DetailSchedule.findById(booking.MongoDetailId);
          if (detailSchedule) {
            // Convert to plain object và xử lý Map Table
            detailSchedule = detailSchedule.toObject({ flattenMaps: true });
            
            // Đảm bảo Table được convert đúng cách nếu vẫn là Map
            if (detailSchedule.Table && detailSchedule.Table instanceof Map) {
              const tableObj = {};
              detailSchedule.Table.forEach((value, key) => {
                tableObj[key] = value;
              });
              detailSchedule.Table = tableObj;
            } else if (detailSchedule.Table && typeof detailSchedule.Table === 'object') {
              // Nếu đã là object nhưng có thể cần convert nested objects
              const tableObj = {};
              Object.keys(detailSchedule.Table).forEach(key => {
                const tableInfo = detailSchedule.Table[key];
                if (tableInfo && typeof tableInfo === 'object') {
                  tableObj[key] = {
                    TableName: tableInfo.TableName || tableInfo.tableName || '',
                    Price: tableInfo.Price || tableInfo.price || ''
                  };
                } else {
                  tableObj[key] = tableInfo;
                }
              });
              detailSchedule.Table = tableObj;
            }
          }
        } catch (mongoError) {
          console.error("Error fetching DetailSchedule from MongoDB:", mongoError);
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          ...booking,
          detailSchedule: detailSchedule
        }
      });
    } catch (error) {
      console.error("getById error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching booking details",
        error: error.message
      });
    }
  }

  // GET /api/booking-tables/bar/:barId/unconfirmed - Lấy bookings chưa confirm
  async getUnconfirmedBookings(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { barId } = req.params;
      const result = await bookingTableService.getUnconfirmedBookingsByBar(accountId, req.query);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error("getUnconfirmedBookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching unconfirmed bookings",
        error: error.message
      });
    }
  }

  /**
   * Bar xác nhận booking
   * POST /api/bar/bookings/:id/confirm
   */
  async confirmBookingByBar(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { id } = req.params; // bookedScheduleId
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      // Lấy BarPage của account
      const barPageModel = require("../models/barPageModel");
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ success: false, message: "Access denied - No BarPage found" });
      }
      
      // Lấy booking
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }
      
      // Kiểm tra quyền (booking phải thuộc về bar này)
      // ReceiverId trong booking là EntityAccountId của bar, không phải BarPageId
      const bookingReceiverId = booking.ReceiverId?.toString().toLowerCase();
      const barEntityAccountId = barPage.EntityAccountId?.toString().toLowerCase();
      
      console.log('[confirmBookingByBar] Checking authorization:', {
        bookingReceiverId,
        barEntityAccountId,
        barPageId: barPage.BarPageId,
        match: bookingReceiverId === barEntityAccountId
      });
      
      if (bookingReceiverId !== barEntityAccountId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Update booking
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      await pool.request()
        .input("BookedScheduleId", sql.UniqueIdentifier, id)
        .input("BarPageId", sql.UniqueIdentifier, barPage.BarPageId)
        .query(`
          UPDATE BookedSchedules
          SET BarConfirmationStatus = 'confirmed',
              BarConfirmedAt = GETDATE(),
              BarConfirmedBy = @BarPageId,
              ScheduleStatus = 'Confirmed'
          WHERE BookedScheduleId = @BookedScheduleId
        `);
      
      // Gửi notification cho người dùng
      try {
        const notificationService = require("../services/notificationService");
        const entityAccountModel = require("../models/entityAccountModel");
        const userEntityAccountId = booking.BookerId;
        const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(barPage.BarPageId, "BarPage");
        
        if (userEntityAccountId && barEntityAccountId) {
          await notificationService.createNotification({
            type: "Confirm",
            sender: barEntityAccountId,
            receiver: userEntityAccountId,
            content: `Đặt bàn của bạn đã được xác nhận. Mã voucher: ${booking.VoucherCode || 'N/A'}`,
            link: `/booking/my`
          });
        }
      } catch (notifError) {
        console.warn("[BookingTableController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Đã xác nhận đặt bàn",
        data: { voucherCode: booking.VoucherCode }
      });
      
    } catch (error) {
      console.error("confirmBookingByBar error:", error);
      return res.status(500).json({
        success: false,
        message: "Error confirming booking",
        error: error.message,
      });
    }
  }

  /**
   * Bar từ chối booking
   * POST /api/bar/bookings/:id/reject
   */
  async rejectBookingByBar(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { id } = req.params; // bookedScheduleId
      const { rejectionReason } = req.body;
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      // Lấy BarPage của account
      const barPageModel = require("../models/barPageModel");
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ success: false, message: "Access denied - No BarPage found" });
      }
      
      // Lấy booking
      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const booking = await bookedScheduleModel.getBookedScheduleById(id);
      if (!booking) {
        return res.status(404).json({ success: false, message: "Booking not found" });
      }
      
      // Kiểm tra quyền
      // booking.ReceiverId là EntityAccountId của bar, barPage.BarPageId là BarPageId -> phải so sánh với barPage.EntityAccountId
      const bookingReceiverId = booking.ReceiverId?.toString().toLowerCase();
      const barEntityAccountId = barPage.EntityAccountId?.toString().toLowerCase();
      if (!bookingReceiverId || !barEntityAccountId || bookingReceiverId !== barEntityAccountId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Update booking
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      await pool.request()
        .input("BookedScheduleId", sql.UniqueIdentifier, id)
        .input("BarPageId", sql.UniqueIdentifier, barPage.BarPageId)
        .input("RejectionReason", sql.NVarChar(sql.MAX), rejectionReason || null)
        .query(`
          UPDATE BookedSchedules
          SET BarConfirmationStatus = 'rejected',
              BarConfirmedAt = GETDATE(),
              BarConfirmedBy = @BarPageId,
              RejectionReason = @RejectionReason,
              ScheduleStatus = 'Rejected'
          WHERE BookedScheduleId = @BookedScheduleId
        `);
      
      // Tạo refund request
      const refundRequestModel = require("../models/refundRequestModel");
      // Không tạo trùng refund request
      const existingRefundRequest = await refundRequestModel.findByBookedScheduleId(id);
      if (existingRefundRequest) {
        return res.json({
          success: true,
          message: "Đã từ chối đặt bàn. Yêu cầu hoàn tiền đã tồn tại.",
          data: { refundRequest: existingRefundRequest }
        });
      }

      let refundAmount = booking.DepositAmount || 100000;
      if (booking.VoucherDistributionId) {
        const voucherDistributionModel = require("../models/voucherDistributionModel");
        const distribution = await voucherDistributionModel.findByBookedScheduleId(id);
        if (distribution) {
          refundAmount += parseFloat(distribution.SalePrice || 0);
        }
      }
      
      // Convert EntityAccountId (booking.BookerId) -> AccountId để lưu vào RefundRequests.UserId
      const entityAccountModel = require("../models/entityAccountModel");
      const bookerEntityInfo = await entityAccountModel.verifyEntityAccountId(booking.BookerId);
      const bookerAccountId = bookerEntityInfo?.AccountId;
      if (!bookerAccountId) {
        return res.status(500).json({
          success: false,
          message: "Không xác định được AccountId của người đặt để tạo yêu cầu hoàn tiền"
        });
      }

      await refundRequestModel.createRefundRequest({
        bookedScheduleId: id,
        userId: bookerAccountId,
        amount: refundAmount,
        reason: rejectionReason || "Bar từ chối đặt bàn"
      });
      
      // Gửi notification cho người dùng và kế toán
      try {
        const notificationService = require("../services/notificationService");
        const entityAccountModel = require("../models/entityAccountModel");
        const userEntityAccountId = booking.BookerId;
        const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(barPage.BarPageId, "BarPage");
        
        // Thông báo người dùng
        if (userEntityAccountId && barEntityAccountId) {
          await notificationService.createNotification({
            type: "Info",
            sender: barEntityAccountId,
            receiver: userEntityAccountId,
            content: `Đặt bàn của bạn đã bị từ chối. Yêu cầu hoàn tiền đã được gửi.`,
            link: `/booking/my`
          });
        }
        
        // Thông báo kế toán
        const accountantResult = await pool.request().query(`
          SELECT TOP 1 AccountId FROM Accounts WHERE Role = 'Accountant' ORDER BY CreatedAt ASC
        `);
        if (accountantResult.recordset.length > 0) {
          const accountantAccountId = accountantResult.recordset[0].AccountId;
          const accountantEntityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(accountantAccountId, "Account");
          if (accountantEntityAccountId && barEntityAccountId) {
            await notificationService.createNotification({
              type: "Info",
              sender: barEntityAccountId,
              receiver: accountantEntityAccountId,
              content: `Yêu cầu hoàn tiền ${refundAmount.toLocaleString('vi-VN')} đ cho booking #${id.substring(0, 8)}`,
              link: `/accountant/refund-requests`
            });
          }
        }
      } catch (notifError) {
        console.warn("[BookingTableController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Đã từ chối đặt bàn. Yêu cầu hoàn tiền đã được gửi.",
      });
      
    } catch (error) {
      console.error("rejectBookingByBar error:", error);
      return res.status(500).json({
        success: false,
        message: "Error rejecting booking",
        error: error.message,
      });
    }
  }

  /**
   * Bar xem danh sách booking chờ xác nhận
   * GET /api/bar/bookings/pending
   */
  async getPendingBookings(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      // Lấy BarPage của account
      const barPageModel = require("../models/barPageModel");
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Lấy bookings chờ xác nhận
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      const entityAccountModel = require("../models/entityAccountModel");
      const barEntityAccountId = await entityAccountModel.getEntityAccountIdByEntityId(barPage.BarPageId, "BarPage");
      
      const result = await pool.request()
        .input("ReceiverId", sql.UniqueIdentifier, barEntityAccountId)
        .query(`
          SELECT bs.*,
            a.UserName AS BookerName,
            a.Email AS BookerEmail
          FROM BookedSchedules bs
          LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
          LEFT JOIN Accounts a ON ea.EntityType = 'Account' AND ea.EntityId = a.AccountId
          WHERE bs.ReceiverId = @ReceiverId
            AND bs.BarConfirmationStatus = 'pending'
            AND bs.PaymentStatus = 'Paid'
          ORDER BY bs.CreatedAt DESC
        `);
      
      return res.json({
        success: true,
        data: result.recordset
      });
      
    } catch (error) {
      console.error("getPendingBookings error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching pending bookings",
        error: error.message,
      });
    }
  }
}

module.exports = new BookingTableController();
