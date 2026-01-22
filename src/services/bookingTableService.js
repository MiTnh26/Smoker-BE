// src/services/bookingTableService.js
const bookedScheduleModel = require("../models/bookedScheduleModel");
const comboModel = require("../models/comboModel");
const voucherModel = require("../models/voucherModel");
const qrService = require("../services/qrService");
const DetailSchedule = require("../models/detailSchedule");
const barTableModel = require("../models/barTableModel");
const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");

class BookingTableService {
  /**
   * Tạo booking bàn với combo và voucher (luồng mới)
   */
  async createBarTableBookingWithCombo({
    bookerAccountId,  // AccountId lấy từ token
    receiverEntityId, // EntityAccountId của bar
    comboId,          // ID combo bắt buộc
    voucherCode,      // Voucher code (optional)
    tableId,          // ID bàn được chọn
    bookingDate,
    startTime,
    endTime,
    note = ""
  }) {
    if (!bookerAccountId || !receiverEntityId || !comboId || !tableId) {
      return {
        success: false,
        message: "Thiếu thông tin bắt buộc: bookerAccountId, receiverEntityId, comboId, tableId"
      };
    }

    // Map AccountId → EntityAccountId cho người đặt
    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
    }

    try {
      // 1. Lấy thông tin combo
      const combo = await comboModel.getComboById(comboId);
      if (!combo) {
        return { success: false, message: "Combo không tồn tại" };
      }

      // 2. Validate và áp dụng voucher (nếu có)
      let voucher = null;
      let discountPercentage = 0;

      if (voucherCode) {
        // voucher áp dụng dựa trên giá combo (Price)
        const voucherValidation = await voucherModel.validateVoucher(voucherCode, combo.Price);
        if (!voucherValidation.valid) {
          return { success: false, message: voucherValidation.reason };
        }
        voucher = voucherValidation.voucher; // voucher object từ DB
        // Không còn DiscountPercentage, set về 0
        discountPercentage = 0;
      }

      // 3. Tính toán các amounts theo logic mới
      const amounts = bookedScheduleModel.calculateBookingAmounts(
        combo.Price,
        discountPercentage
      );

      // 4. Lưu chi tiết bàn và combo vào Mongo
      const tableMap = {};
      const table = await barTableModel.getBarTableById(tableId);
      tableMap[tableId] = {
        TableName: table?.TableName || `Bàn ${tableId}`,
      };

      const detailDoc = await DetailSchedule.create({
        Table: tableMap,
        Combo: {
          ComboId: comboId,
          ComboName: combo.ComboName,
          Price: combo.Price
        },
        Voucher: voucher ? {
          VoucherId: voucher.VoucherId,
          VoucherCode: voucher.VoucherCode,
          VoucherName: voucher.VoucherName || ""
        } : null,
        Note: note || "",
      });

      // 5. Tạo booking trong SQL với logic combo mới
      const createdBooking = await bookedScheduleModel.createBookedScheduleWithCombo({
        bookerId: bookerEntityId,
        receiverId: receiverEntityId,
        voucherId: voucher?.VoucherId || null,
        type: "BarTable",
        originalComboPrice: amounts.originalPrice,
        discountPercentages: amounts.discountPercentages,
        finalPaymentAmount: amounts.finalPaymentAmount,
        bookingDate,
        startTime,
        endTime,
        mongoDetailId: detailDoc._id.toString(),
      });

      return {
        success: true,
        message: "Đặt bàn thành công",
        data: {
          ...createdBooking,
          combo,
          voucher,
          amounts,
          detailSchedule: detailDoc,
        },
      };
    } catch (error) {
      console.error("createBarTableBookingWithCombo error:", error);
      return {
        success: false,
        message: error.message || "Lỗi khi tạo booking bàn",
      };
    }
  }

  /**
   * Tạo booking bàn theo cách cũ (backward compatibility)
   * @deprecated Sử dụng createBarTableBookingWithCombo thay thế
   */
  async createBarTableBooking({
    bookerAccountId,
    receiverEntityId,
    tables,
    note,
    totalAmount,
    bookingDate,
    startTime,
    endTime,
    paymentStatus = "Pending",
    scheduleStatus = "Pending",
  }) {
    // Fallback to old logic - but log deprecation warning
    console.warn("⚠️  DEPRECATED: createBarTableBooking is deprecated. Use createBarTableBookingWithCombo instead.");

    if (!bookerAccountId || !receiverEntityId) {
      return { success: false, message: "Thiếu bookerAccountId hoặc receiverEntityId" };
    }

    if (!Array.isArray(tables) || tables.length === 0) {
      return { success: false, message: "Danh sách bàn không được để trống" };
    }

    // Map AccountId → EntityAccountId cho người đặt
    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
    }

    try {
      // 1. Lưu chi tiết bàn vào Mongo
      const tableMap = {};
      for (const t of tables) {
        if (!t.id || !t.tableName || t.price == null) continue;
        tableMap[t.id] = {
          TableName: t.tableName,
          Price: String(t.price),
        };
      }

      const detailDoc = await DetailSchedule.create({
        Table: tableMap,
        Note: note || "",
      });

      // 2. Lưu booking tổng vào SQL (BookerId & ReceiverId đều là EntityAccountId)
      const createdBooking = await bookedScheduleModel.createBookedSchedule({
        bookerId: bookerEntityId,
        receiverId: receiverEntityId,
        type: "BarTable",
        totalAmount: totalAmount || 0,
        paymentStatus: paymentStatus,
        scheduleStatus: scheduleStatus,
        bookingDate,
        startTime,
        endTime,
        mongoDetailId: detailDoc._id.toString(),
      });

      return {
        success: true,
        message: "Đặt bàn thành công",
        data: {
          ...createdBooking,
          detailSchedule: detailDoc,
        },
      };
    } catch (error) {
      console.error("createBarTableBooking error:", error);
      return {
        success: false,
        message: error.message || "Lỗi khi tạo booking bàn",
      };
    }
  }

  /**
   * Xác nhận booking bằng QR code (thay thế confirm thủ công)
   */
  async confirmBookingByQR(qrData, receiverAccountId) {
    // Map account của bar → EntityAccountId
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId) {
      return { success: false, message: "Không tìm thấy thông tin bar" };
    }

    // Validate QR và confirm booking
    const qrResult = await qrService.validateAndConfirmBooking(qrData, receiverEntityId);

    if (!qrResult.valid) {
      return {
        success: false,
        message: qrResult.reason,
        data: qrResult
      };
    }

    return {
      success: true,
      message: qrResult.message,
      data: qrResult.booking,
      confirmedAt: qrResult.confirmedAt
    };
  }

  /**
   * Xác nhận booking thủ công (fallback cho trường hợp không có QR)
   * Chuyển từ Pending → Confirmed
   */
  async confirmBooking(bookedScheduleId, receiverAccountId) {
    const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);
    if (!schedule) {
      return { success: false, message: "Không tìm thấy booking" };
    }

    // Map account của bar → EntityAccountId rồi so sánh
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId || schedule.ReceiverId.toLowerCase() !== receiverEntityId.toLowerCase()) {
      return { success: false, message: "Bạn không có quyền xác nhận booking này" };
    }

    // Kiểm tra status hiện tại
    const currentStatus = schedule.ScheduleStatus || schedule.scheduleStatus;
    if (currentStatus !== 'Pending') {
      return { 
        success: false, 
        message: `Không thể xác nhận booking ở trạng thái: ${currentStatus}. Chỉ có thể xác nhận từ trạng thái Pending.` 
      };
    }

    // Cập nhật status thành Confirmed
    const updated = await bookedScheduleModel.updateBookedScheduleStatuses(bookedScheduleId, {
      scheduleStatus: 'Confirmed'
    });

    return {
      success: true,
      message: "Xác nhận booking thành công",
      data: updated,
    };
  }

  /**
   * Hủy booking - theo quy tắc mới: KHÔNG CHO HỦY sau khi thanh toán
   */
  async cancelBooking(bookedScheduleId, bookerAccountId) {
    const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);
    if (!schedule) {
      return { success: false, message: "Không tìm thấy booking" };
    }

    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId || schedule.BookerId.toLowerCase() !== bookerEntityId.toLowerCase()) {
      return { success: false, message: "Bạn không có quyền huỷ booking này" };
    }

    // Theo quy tắc mới: KHÔNG cho hủy sau khi đã thanh toán
    if (schedule.PaymentStatus === "Paid") {
      return {
        success: false,
        message: "Không thể hủy booking đã thanh toán. Vui lòng liên hệ bar để giải quyết."
      };
    }

    // Chỉ cho hủy khi chưa thanh toán và đang Pending
    if (schedule.ScheduleStatus !== "Pending") {
      return { success: false, message: "Chỉ được huỷ booking đang ở trạng thái Pending" };
    }

    const updated = await bookedScheduleModel.updateBookedScheduleStatuses(bookedScheduleId, {
      scheduleStatus: "Canceled",
    });

    return {
      success: true,
      message: "Huỷ booking thành công",
      data: updated,
    };
  }

  /**
   * Yêu cầu hoàn tiền (chỉ khi bar không phục vụ đúng combo)
   */
  async requestRefund(bookedScheduleId, bookerAccountId, reason, evidenceUrls = []) {
    const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);
    if (!schedule) {
      return { success: false, message: "Không tìm thấy booking" };
    }

    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId || schedule.BookerId.toLowerCase() !== bookerEntityId.toLowerCase()) {
      return { success: false, message: "Bạn không có quyền yêu cầu hoàn tiền cho booking này" };
    }

    // Chỉ cho phép hoàn tiền khi đã confirm và có vấn đề
    const scheduleStatus = schedule.ScheduleStatus || schedule.scheduleStatus;
    if (scheduleStatus !== "Confirmed") {
      return { success: false, message: "Booking chưa được bar xác nhận" };
    }

    // Cập nhật refund status
    const updated = await bookedScheduleModel.updateRefundStatus(bookedScheduleId, {
      refundStatus: "Requested",
      refundReason: reason,
      refundEvidence: evidenceUrls
    });

    return {
      success: true,
      message: "Đã gửi yêu cầu hoàn tiền. Chúng tôi sẽ xử lý trong 24-48h.",
      data: updated,
    };
  }

  async getByBooker(bookerAccountId, { limit = 50, offset = 0 } = {}) {
    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
    }

    const data = await bookedScheduleModel.getBookedSchedulesByBooker(bookerEntityId, { limit, offset });

    // Populate detailSchedule từ MongoDB cho mỗi booking
    const bookingsWithDetails = await Promise.all(
      data.map(async (booking) => {
        if (booking.MongoDetailId) {
          try {
            const detailScheduleDoc = await DetailSchedule.findById(booking.MongoDetailId);
            const detailSchedule = detailScheduleDoc
              ? (detailScheduleDoc.toObject ? detailScheduleDoc.toObject({ flattenMaps: true }) : detailScheduleDoc)
              : null;
            return {
              ...booking,
              detailSchedule: detailSchedule,
            };
          } catch (error) {
            console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
            return {
              ...booking,
              detailSchedule: null,
            };
          }
        }
        return {
          ...booking,
          detailSchedule: null,
        };
      })
    );

    return { success: true, data: bookingsWithDetails };
  }

  async getByReceiver(receiverAccountId, { limit = 50, offset = 0 } = {}) {
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho bar" };
    }

    const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverEntityId, { limit, offset });
    return { success: true, data };
  }

  // Get by receiver EntityAccountId directly (for frontend that sends EntityAccountId)
  async getByReceiverEntityId(receiverEntityId, { limit = 50, offset = 0, date } = {}) {
    if (!receiverEntityId) {
      return { success: false, message: "receiverEntityId is required" };
    }

    const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverEntityId, { limit, offset, date });

    // Populate detailSchedule từ MongoDB cho mỗi booking
    const bookingsWithDetails = await Promise.all(
      data.map(async (booking) => {
        if (booking.MongoDetailId) {
          try {
            const detailScheduleDoc = await DetailSchedule.findById(booking.MongoDetailId);
            const detailSchedule = detailScheduleDoc
              ? (detailScheduleDoc.toObject ? detailScheduleDoc.toObject({ flattenMaps: true }) : detailScheduleDoc)
              : null;
            return {
              ...booking,
              detailSchedule: detailSchedule,
            };
          } catch (error) {
            console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
            return {
              ...booking,
              detailSchedule: null,
            };
          }
        }
        return {
          ...booking,
          detailSchedule: null,
        };
      })
    );

    return { success: true, data: bookingsWithDetails };
  }

  /**
   * Lấy bookings chưa được bar confirm (có QR code)
   */
  async getUnconfirmedBookingsByBar(receiverAccountId, { limit = 50, offset = 0 } = {}) {
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho bar" };
    }

    const data = await bookedScheduleModel.getUnconfirmedBookings(receiverEntityId, { limit, offset });
    return { success: true, data };
  }

  /**
   * Lấy combos available cho bar
   */
  async getAvailableCombosByBar(barId) {
    try {
      const combos = await comboModel.getAvailableCombosByBarId(barId);
      return { success: true, data: combos };
    } catch (error) {
      return { success: false, message: "Lỗi khi lấy danh sách combo", error: error.message };
    }
  }

  /**
   * Lấy vouchers available cho user
   */
  async getAvailableVouchers() {
    try {
      // Lấy tất cả voucher (không phụ thuộc Status ở DB vì có thể đang NULL)
      const vouchers = await voucherModel.getAllVouchers({});

      // Filter chỉ theo status và usage
      const availableVouchers = (vouchers || []).filter(v => {
        const status = (v.Status || "").toUpperCase();
        const isActiveLike = status === "" || status === "ACTIVE";
        const hasUsage = Number(v.UsedCount) < Number(v.MaxUsage);

        return isActiveLike && hasUsage;
      });

      return { success: true, data: availableVouchers };
    } catch (error) {
      return { success: false, message: "Lỗi khi lấy danh sách voucher", error: error.message };
    }
  }

  /**
   * Validate combo và voucher trước khi booking
   */
  async validateBookingData({ comboId, voucherCode, barId }) {
    try {
      // Validate combo
      const combo = await comboModel.getComboById(comboId);
      if (!combo) {
        return { valid: false, reason: "Combo không tồn tại" };
      }

      if (combo.BarId !== barId) {
        return { valid: false, reason: "Combo không thuộc bar này" };
      }

      // Combos table hiện tại không còn cột Status => coi là khả dụng nếu tồn tại và thuộc bar

      // Validate voucher (nếu có)
      let voucher = null;
      let discountPercentage = 0;

      if (voucherCode) {
        const voucherValidation = await voucherModel.validateVoucher(voucherCode, combo.Price);
        if (!voucherValidation.valid) {
          return { valid: false, reason: voucherValidation.reason };
        }
        voucher = voucherValidation.voucher;
        // Không còn DiscountPercentage, set về 0
        discountPercentage = 0;
      }

      // Tính toán amounts
      const amounts = bookedScheduleModel.calculateBookingAmounts(
        combo.Price,
        discountPercentage
      );

      return {
        valid: true,
        combo,
        voucher,
        amounts,
        message: "Dữ liệu hợp lệ"
      };
    } catch (error) {
      return { valid: false, reason: "Lỗi validate dữ liệu: " + error.message };
    }
  }

  /**
   * Tạo booking với voucher mới (luồng mới)
   */
  async createBookingWithVoucher({
    bookerAccountId,
    receiverEntityId,
    tableId,
    voucherId = null,  // Optional - nếu null thì chỉ đặt bàn với cọc 100k
    salePrice = null,  // Optional - chỉ cần khi có voucherId
    bookingDate,
    startTime,
    endTime,
    note = ""
  }) {
    if (!bookerAccountId || !receiverEntityId || !tableId) {
      return {
        success: false,
        message: "Thiếu thông tin bắt buộc: bookerAccountId, receiverEntityId, tableId"
      };
    }

    // Nếu có voucher thì phải có salePrice
    if (voucherId && !salePrice) {
      return {
        success: false,
        message: "salePrice là bắt buộc khi có voucherId"
      };
    }

    try {
      const voucherDistributionModel = require("../models/voucherDistributionModel");
      const voucherModel = require("../models/voucherModel");
      const bookingPaymentModel = require("../models/bookingPaymentModel");
      const notificationService = require("../services/notificationService");
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();

      // 1. Map AccountId → EntityAccountId
      const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
      if (!bookerEntityId) {
        return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
      }

      // 2. Lấy voucher gốc từ bar (nếu có)
      let voucher = null;
      if (voucherId) {
        voucher = await voucherModel.getVoucherById(voucherId);
        if (!voucher || voucher.VoucherStatus !== 'approved' || voucher.VoucherType !== 'bar_created') {
          return { success: false, message: "Voucher không hợp lệ hoặc chưa được duyệt" };
        }
      }

      // 3. Lấy thông tin bàn
      const table = await barTableModel.getBarTableById(tableId);
      if (!table) {
        return { success: false, message: "Bàn không tồn tại" };
      }

      // 4. Tính toán profit và tạo voucher cho user (nếu có voucher)
      let adminProfit = 0;
      let systemProfit = 0;
      let userBenefit = 0;
      let userVoucher = null;
      let userVoucherCode = null;
      let managerId = null;

      if (voucher && salePrice) {
        const profitResult = voucherDistributionModel.calculateProfit(voucher.OriginalValue, salePrice);
        adminProfit = profitResult.adminProfit;
        systemProfit = profitResult.systemProfit;
        userBenefit = profitResult.userBenefit;

        // 5. Tạo voucher mới cho người dùng
        const crypto = require('crypto');
        userVoucherCode = `${voucher.VoucherCode}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        
        // Lấy managerId từ admin (giả sử có trong req.user hoặc tìm admin đầu tiên)
        const managerResult = await pool.request().query(`
          SELECT TOP 1 ManagerId FROM Managers ORDER BY CreatedAt ASC
        `);
        managerId = managerResult.recordset[0]?.ManagerId;

        userVoucher = await voucherModel.createVoucher({
          voucherName: voucher.VoucherName,
          voucherCode: userVoucherCode,
          status: "ACTIVE",
          maxUsage: 1,
          createdByAdmin: managerId
        });

        // Update userVoucher với thông tin phân phối
        await pool.request()
          .input("VoucherId", sql.UniqueIdentifier, userVoucher.VoucherId)
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
      }

      // 6. Lưu detail vào Mongo
      const tableMap = {};
      tableMap[tableId] = {
        TableName: table?.TableName || `Bàn ${tableId}`,
      };

      const detailDoc = await DetailSchedule.create({
        Table: tableMap,
        Voucher: userVoucher ? {
          VoucherId: userVoucher.VoucherId,
          VoucherCode: userVoucherCode,
          VoucherName: voucher.VoucherName,
          OriginalValue: voucher.OriginalValue,
          SalePrice: salePrice
        } : null,
        Note: note || "",
      });

      // 7. Tạo booking với deposit 100k
      const depositAmount = 100000;
      const voucherPrice = voucher && salePrice ? parseFloat(salePrice) : 0;
      const totalAmount = voucherPrice + depositAmount;

      const createdBooking = await bookedScheduleModel.createBookedSchedule({
        bookerId: bookerEntityId,
        receiverId: receiverEntityId,
        type: "BarTable",
        originalPrice: totalAmount,
        totalAmount: totalAmount,
        paymentStatus: "Pending", // Sẽ update sau khi thanh toán
        scheduleStatus: "Upcoming",
        bookingDate,
        startTime,
        endTime,
        mongoDetailId: detailDoc._id.toString(),
        depositAmount: depositAmount
      });

      // 8. Tạo VoucherDistribution (nếu có voucher)
      let distribution = null;
      if (voucher && userVoucher && managerId) {
        distribution = await voucherDistributionModel.createDistribution({
          voucherId: voucher.VoucherId,
          userVoucherId: userVoucher.VoucherId,
          bookedScheduleId: createdBooking.BookedScheduleId,
          adminId: managerId,
          userId: bookerAccountId,
          originalValue: voucher.OriginalValue,
          salePrice,
          adminProfit,
          systemProfit,
          userBenefit,
          status: 'active'
        });

        // 9. Update booking với VoucherDistributionId và VoucherCode
        await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, createdBooking.BookedScheduleId)
          .input("VoucherDistributionId", sql.UniqueIdentifier, distribution.DistributionId)
          .input("VoucherCode", sql.NVarChar(50), userVoucherCode)
          .input("VoucherId", sql.UniqueIdentifier, userVoucher.VoucherId)
          .input("DepositAmount", sql.Decimal(18, 2), depositAmount)
          .query(`
            UPDATE BookedSchedules
            SET VoucherDistributionId = @VoucherDistributionId,
                VoucherCode = @VoucherCode,
                VoucherId = @VoucherId,
                DepositAmount = @DepositAmount
            WHERE BookedScheduleId = @BookedScheduleId
          `);
      } else {
        // Không có voucher: chỉ update DepositAmount
        await pool.request()
          .input("BookedScheduleId", sql.UniqueIdentifier, createdBooking.BookedScheduleId)
          .input("DepositAmount", sql.Decimal(18, 2), depositAmount)
          .query(`
            UPDATE BookedSchedules
            SET DepositAmount = @DepositAmount
            WHERE BookedScheduleId = @BookedScheduleId
          `);
      }

      // 10. Tạo payment link (PayOS)
      const payosService = require("../services/payosService");
      
      // Generate orderCode từ BookedScheduleId (lấy 8 ký tự đầu sau khi bỏ dấu gạch ngang)
      const orderCodeStr = createdBooking.BookedScheduleId.replace(/-/g, '').substring(0, 8);
      const orderCode = parseInt(orderCodeStr, 16) || parseInt(orderCodeStr, 10) || Date.now() % 100000000;
      
      // Description tối đa 25 ký tự cho PayOS, hoặc để trống
      // Rút ngắn description nếu cần
      let description = "";
      if (voucher && userVoucherCode) {
        // Rút ngắn: "Dat ban + voucher code" (tối đa 25 ký tự)
        const shortCode = userVoucherCode.length > 10 ? userVoucherCode.substring(0, 10) : userVoucherCode;
        description = `Dat ban + ${shortCode}`.substring(0, 25);
      } else {
        // Không có voucher: "Dat ban coc"
        description = "Dat ban coc".substring(0, 25);
      }
      
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const paymentLink = await payosService.createPayment({
        orderCode: orderCode,
        amount: totalAmount,
        description: description || "Dat ban", // Fallback nếu description rỗng
        returnUrl: `${frontendUrl}/payment-return?type=table-booking&bookingId=${createdBooking.BookedScheduleId}&orderCode=${orderCode}`,
        cancelUrl: `${frontendUrl}/payment-cancel?type=table-booking&bookingId=${createdBooking.BookedScheduleId}`
      });

      // 11. Lưu payment
      await bookingPaymentModel.createBookingPayment({
        bookedScheduleId: createdBooking.BookedScheduleId,
        orderCode: paymentLink.orderCode || orderCode
      });

      // 12. Gửi notification cho bar
      try {
        const entityAccountModel = require("../models/entityAccountModel");
        const barEntityAccountId = receiverEntityId;
        const userEntityAccountId = bookerEntityId;

        const notificationContent = voucher 
          ? `Có đặt bàn mới với voucher ${userVoucherCode}. Vui lòng xác nhận.`
          : `Có đặt bàn mới (đã thanh toán cọc 100.000 đ). Vui lòng xác nhận.`;

        await notificationService.createNotification({
          type: "Info",
          sender: userEntityAccountId,
          receiver: barEntityAccountId,
          content: notificationContent,
          link: `/bar/bookings/pending`
        });
      } catch (notifError) {
        console.warn("[BookingTableService] Failed to send notification:", notifError);
      }

      return {
        success: true,
        message: voucher 
          ? "Đặt bàn thành công. Vui lòng thanh toán voucher + cọc."
          : "Đặt bàn thành công. Vui lòng thanh toán cọc.",
        data: {
          booking: createdBooking,
          voucherCode: userVoucherCode,
          paymentLink: paymentLink.paymentUrl || paymentLink.checkoutUrl,
          distribution: voucher ? {
            adminProfit,
            systemProfit,
            userBenefit
          } : null
        }
      };
    } catch (error) {
      console.error("createBookingWithVoucher error:", error);
      return {
        success: false,
        message: error.message || "Lỗi khi tạo booking với voucher"
      };
    }
  }
}

module.exports = new BookingTableService();
