
// src/models/bookedScheduleModel.js

const { getPool, sql } = require("../db/sqlserver");

function toDateOrNull(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

// tạo booking mới
async function createBookedSchedule({
  bookerId,
  receiverId,
  type,
  originalPrice = 0,
  totalAmount = 0,
  discountPercentages = 0,
  voucherId = null,
  paymentStatus = "Pending",
  scheduleStatus = "Upcoming",
  bookingDate = null,
  startTime = null,
  endTime = null,
  mongoDetailId = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookerId", sql.UniqueIdentifier, bookerId)
    .input("ReceiverId", sql.UniqueIdentifier, receiverId)
    .input("Type", sql.NVarChar(100), type)
    .input("OriginalPrice", sql.Int, originalPrice || 0)
    .input("TotalAmount", sql.Int, totalAmount || 0)
    .input("DiscountPercentages", sql.Int, discountPercentages || 0)
    .input("VoucherId", sql.UniqueIdentifier, voucherId || null)
    .input("PaymentStatus", sql.NVarChar(20), paymentStatus)
    .input("ScheduleStatus", sql.NVarChar(20), scheduleStatus)
    .input("BookingDate", sql.DateTime, toDateOrNull(bookingDate))
    .input("StartTime", sql.DateTime, toDateOrNull(startTime))
    .input("EndTime", sql.DateTime, toDateOrNull(endTime))
    .input("MongoDetailId", sql.NVarChar(50), mongoDetailId || null)
    .query(`
      INSERT INTO BookedSchedules (
        BookerId,
        ReceiverId,
        Type,
        OriginalPrice,
        TotalAmount,
        DiscountPercentages,
        VoucherId,
        PaymentStatus,
        ScheduleStatus,
        BookingDate,
        StartTime,
        EndTime,
        MongoDetailId
      )
      OUTPUT
        inserted.BookedScheduleId,
        inserted.BookerId,
        inserted.ReceiverId,
        inserted.Type,
        inserted.OriginalPrice,
        inserted.TotalAmount,
        inserted.DiscountPercentages,
        inserted.VoucherId,
        inserted.PaymentStatus,
        inserted.ScheduleStatus,
        inserted.BookingDate,
        inserted.StartTime,
        inserted.EndTime,
        inserted.MongoDetailId,
        inserted.ReviewStatus,
        inserted.RefundStatus,
        inserted.created_at
      VALUES (
        @BookerId,
        @ReceiverId,
        @Type,
        @OriginalPrice,
        @TotalAmount,
        @DiscountPercentages,
        @VoucherId,
        @PaymentStatus,
        @ScheduleStatus,
        @BookingDate,
        @StartTime,
        @EndTime,
        @MongoDetailId
      );
    `);

  return result.recordset[0];
}

async function getBookedScheduleById(bookedScheduleId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT
        bs.*,
        v.VoucherName,
        v.VoucherCode,
        v.DiscountPercentage,
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS BookerAvatar,
        CASE
          WHEN bs.Type = 'business' THEN ba2.UserName
          ELSE a2.UserName
        END AS ReceiverName,
        CASE
          WHEN bs.Type = 'business' THEN ba2.Avatar
          ELSE a2.Avatar
        END AS ReceiverAvatar,
        bp.BarName,
        bp.Address AS BarAddress
      FROM BookedSchedules bs
      LEFT JOIN Vouchers v ON bs.VoucherId = v.VoucherId
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      LEFT JOIN EntityAccounts ea2 ON bs.ReceiverId = ea2.EntityAccountId
      LEFT JOIN Accounts a2 ON ea2.AccountId = a2.AccountId
      LEFT JOIN BussinessAccounts ba2 ON bs.ReceiverId = ba2.BussinessAccountId
      LEFT JOIN BarPages bp ON bs.ReceiverId = bp.BarPageId
      WHERE bs.BookedScheduleId = @BookedScheduleId;
    `);

  return result.recordset[0] || null;
}

async function getBookedSchedulesByBooker(bookerId, { limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookerId", sql.UniqueIdentifier, bookerId)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset)
    .query(`
      SELECT
        bs.*,
        v.VoucherName,
        v.VoucherCode,
        v.DiscountPercentage,
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS ReceiverName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS ReceiverAvatar,
        bp.BarName,
        bp.Address AS BarAddress
      FROM BookedSchedules bs
      LEFT JOIN Vouchers v ON bs.VoucherId = v.VoucherId
      LEFT JOIN EntityAccounts ea ON bs.ReceiverId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.ReceiverId = ba.BussinessAccountId
      LEFT JOIN BarPages bp ON bs.ReceiverId = bp.BarPageId
      WHERE bs.BookerId = @BookerId
      ORDER BY bs.created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `);

  return result.recordset;
}

async function getBookedSchedulesByReceiver(receiverId, { limit = 50, offset = 0, date } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("ReceiverId", sql.UniqueIdentifier, receiverId)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);

  let whereClause = "WHERE ReceiverId = @ReceiverId";
  
  // Filter by date if provided
  if (date) {
    const dateObj = new Date(date);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);
    
    request.input("StartOfDay", sql.DateTime, startOfDay);
    request.input("EndOfDay", sql.DateTime, endOfDay);
    whereClause += " AND BookingDate >= @StartOfDay AND BookingDate <= @EndOfDay";
  }

  const result = await request.query(`
      SELECT
        bs.*,
        v.VoucherName,
        v.VoucherCode,
        v.DiscountPercentage,
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS BookerAvatar
      FROM BookedSchedules bs
      LEFT JOIN Vouchers v ON bs.VoucherId = v.VoucherId
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      ${whereClause.replace('ReceiverId = @ReceiverId', 'bs.ReceiverId = @ReceiverId')}
      ORDER BY bs.BookingDate DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `);

  return result.recordset;
}

async function updateBookedScheduleStatuses(bookedScheduleId, { paymentStatus, scheduleStatus }) {
  console.log("[bookedScheduleModel] ========== updateBookedScheduleStatuses STARTED ==========");
  console.log("[bookedScheduleModel] Input parameters:", {
    bookedScheduleId: bookedScheduleId,
    bookedScheduleIdType: typeof bookedScheduleId,
    paymentStatus: paymentStatus,
    scheduleStatus: scheduleStatus
  });

  if (paymentStatus === undefined && scheduleStatus === undefined) {
    throw new Error("At least one of paymentStatus or scheduleStatus must be provided");
  }

  const pool = await getPool();
  const request = pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId);

  const setClauses = [];

  if (paymentStatus !== undefined) {
    request.input("PaymentStatus", sql.NVarChar(20), paymentStatus);
    setClauses.push("PaymentStatus = @PaymentStatus");
    console.log("[bookedScheduleModel] Will update PaymentStatus to:", paymentStatus);
  }

  if (scheduleStatus !== undefined) {
    request.input("ScheduleStatus", sql.NVarChar(20), scheduleStatus);
    setClauses.push("ScheduleStatus = @ScheduleStatus");
    console.log("[bookedScheduleModel] Will update ScheduleStatus to:", scheduleStatus);
  }

  const setClause = setClauses.join(", ");
  console.log("[bookedScheduleModel] SET clause:", setClause);

  // Kiểm tra booking có tồn tại không trước khi update
  try {
    const checkResult = await pool.request()
      .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
      .query(`
        SELECT BookedScheduleId, PaymentStatus, ScheduleStatus
        FROM BookedSchedules
        WHERE BookedScheduleId = @BookedScheduleId
      `);
    
    console.log("[bookedScheduleModel] Booking exists check:", {
      found: checkResult.recordset.length > 0,
      currentPaymentStatus: checkResult.recordset[0]?.PaymentStatus,
      currentScheduleStatus: checkResult.recordset[0]?.ScheduleStatus
    });

    if (checkResult.recordset.length === 0) {
      console.error("[bookedScheduleModel] ❌ Booking not found in BookedSchedules table!");
      console.error("[bookedScheduleModel] BookedScheduleId:", bookedScheduleId);
      return null;
    }
  } catch (checkError) {
    console.error("[bookedScheduleModel] ❌ Error checking booking existence:", checkError);
  }

  console.log("[bookedScheduleModel] Executing UPDATE query...");
  const result = await request.query(`
    UPDATE BookedSchedules
    SET ${setClause}
    WHERE BookedScheduleId = @BookedScheduleId;

    SELECT
      BookedScheduleId,
      BookerId,
      ReceiverId,
      Type,
      TotalAmount,
      PaymentStatus,
      ScheduleStatus,
      BookingDate,
      StartTime,
      EndTime,
      MongoDetailId,
      created_at
    FROM BookedSchedules
    WHERE BookedScheduleId = @BookedScheduleId;
  `);

  console.log("[bookedScheduleModel] UPDATE query executed:", {
    rowsAffected: result.rowsAffected?.[0] || result.rowsAffected || 0,
    recordsetLength: result.recordset?.length || 0,
    hasResult: !!result.recordset?.[0]
  });

  const updatedRecord = result.recordset[0] || null;
  
  if (updatedRecord) {
    console.log("[bookedScheduleModel] ✅ Updated record:", {
      bookedScheduleId: updatedRecord.BookedScheduleId,
      paymentStatus: updatedRecord.PaymentStatus,
      scheduleStatus: updatedRecord.ScheduleStatus
    });
  } else {
    console.error("[bookedScheduleModel] ❌ UPDATE query returned no rows!");
    console.error("[bookedScheduleModel] This means the UPDATE did not match any rows or the SELECT returned nothing");
  }

  console.log("[bookedScheduleModel] ========== updateBookedScheduleStatuses COMPLETED ==========");
  return updatedRecord;
}

// Cập nhật amounts cho BarTable booking (TotalAmount + DiscountPercentages)
async function updateBookingAmounts(bookedScheduleId, { totalAmount, discountPercentages } = {}) {
  if (totalAmount === undefined && discountPercentages === undefined) {
    throw new Error("At least one of totalAmount or discountPercentages must be provided");
  }

  const pool = await getPool();
  const request = pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId);

  const setClauses = [];

  if (totalAmount !== undefined) {
    request.input("TotalAmount", sql.Int, parseInt(totalAmount));
    setClauses.push("TotalAmount = @TotalAmount");
  }

  if (discountPercentages !== undefined) {
    request.input("DiscountPercentages", sql.Int, parseInt(discountPercentages));
    setClauses.push("DiscountPercentages = @DiscountPercentages");
  }

  const setClause = setClauses.join(", ");

  const result = await request.query(`
    UPDATE BookedSchedules
    SET ${setClause}
    WHERE BookedScheduleId = @BookedScheduleId;

    SELECT TOP 1 * FROM BookedSchedules WHERE BookedScheduleId = @BookedScheduleId;
  `);

  return result.recordset[0] || null;
}

async function updateRefundStatus(bookedScheduleId, refundStatus) {
  const pool = await getPool();
  
  // Kiểm tra xem cột RefundStatus có tồn tại không
  const checkColumnResult = await pool.request()
    .query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'BookedSchedules' AND COLUMN_NAME = 'RefundStatus'
    `);
  
  if (checkColumnResult.recordset.length === 0) {
    console.warn('⚠️ RefundStatus column does not exist in BookedSchedules, skipping update');
    return null;
  }
  
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .input("RefundStatus", sql.NVarChar(20), refundStatus)
    .query(`
      UPDATE BookedSchedules
      SET RefundStatus = @RefundStatus
      WHERE BookedScheduleId = @BookedScheduleId;

      SELECT
        BookedScheduleId,
        BookerId,
        ReceiverId,
        Type,
        TotalAmount,
        PaymentStatus,
        ScheduleStatus,
        BookingDate,
        StartTime,
        EndTime,
        MongoDetailId,
        ReviewStatus,
        RefundStatus,
        created_at
      FROM BookedSchedules
      WHERE BookedScheduleId = @BookedScheduleId;
    `);

  return result.recordset[0] || null;
}

async function updateBookedScheduleTiming(bookedScheduleId, { bookingDate, startTime, endTime }) {
  if (bookingDate === undefined && startTime === undefined && endTime === undefined) {
    throw new Error("At least one of bookingDate, startTime or endTime must be provided");
  }

  const pool = await getPool();
  const request = pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId);

  const setClauses = [];

  if (bookingDate !== undefined) {
    request.input("BookingDate", sql.DateTime, toDateOrNull(bookingDate));
    setClauses.push("BookingDate = @BookingDate");
  }

  if (startTime !== undefined) {
    request.input("StartTime", sql.DateTime, toDateOrNull(startTime));
    setClauses.push("StartTime = @StartTime");
  }

  if (endTime !== undefined) {
    request.input("EndTime", sql.DateTime, toDateOrNull(endTime));
    setClauses.push("EndTime = @EndTime");
  }

  const setClause = setClauses.join(", ");

  const result = await request.query(`
    UPDATE BookedSchedules
    SET ${setClause}
    WHERE BookedScheduleId = @BookedScheduleId;

    SELECT
      BookedScheduleId,
      BookerId,
      ReceiverId,
      Type,
      TotalAmount,
      PaymentStatus,
      ScheduleStatus,
      BookingDate,
      StartTime,
      EndTime,
      MongoDetailId,
      created_at
    FROM BookedSchedules
    WHERE BookedScheduleId = @BookedScheduleId;
  `);

  return result.recordset[0] || null;
}

async function getBookedSchedulesByRefundStatus(refundStatus, { limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("RefundStatus", sql.NVarChar(20), refundStatus)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset)
    .query(`
      SELECT
        BookedScheduleId,
        BookerId,
        ReceiverId,
        Type,
        TotalAmount,
        PaymentStatus,
        ScheduleStatus,
        BookingDate,
        StartTime,
        EndTime,
        MongoDetailId,
        ReviewStatus,
        RefundStatus,
        created_at
      FROM BookedSchedules
      WHERE RefundStatus = @RefundStatus
      ORDER BY created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `);

  return result.recordset;
}

/**
 * Lấy các booking (BarTable, DJ, Dancer) ở trạng thái pending quá N phút (chưa thanh toán)
 * Dùng cho job tự động dọn dẹp booking chưa thanh toán.
 */
async function getPendingBookingsOlderThan(minutes = 5) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Minutes", sql.Int, minutes)
    .query(`
      SELECT
        BookedScheduleId,
        BookerId,
        ReceiverId,
        Type,
        TotalAmount,
        PaymentStatus,
        ScheduleStatus,
        BookingDate,
        StartTime,
        EndTime,
        MongoDetailId,
        created_at
      FROM BookedSchedules
      WHERE
        (UPPER(RTRIM(LTRIM(Type))) = 'BARTABLE'
         OR UPPER(RTRIM(LTRIM(Type))) = 'DJ'
         OR UPPER(RTRIM(LTRIM(Type))) = 'DANCER')
        AND UPPER(RTRIM(LTRIM(PaymentStatus))) = 'PENDING'
        AND UPPER(RTRIM(LTRIM(ScheduleStatus))) = 'PENDING'
        -- Dùng DATEDIFF SECOND + GETDATE() để tránh lệch múi giờ (created_at dùng giờ local)
        AND DATEDIFF(SECOND, created_at, GETDATE()) >= (@Minutes * 60);
    `);

  return result.recordset || [];
}

/**
 * Xoá một booking theo BookedScheduleId.
 */
async function deleteBookedSchedule(bookedScheduleId) {
  const pool = await getPool();
  await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      -- Xoá các record liên quan trong BookingPayments trước
      IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'BookingPayments')
      BEGIN
        DELETE FROM BookingPayments
        WHERE BookedScheduleId = @BookedScheduleId;
      END

      -- Sau đó mới xoá trong BookedSchedules
      DELETE FROM BookedSchedules
      WHERE BookedScheduleId = @BookedScheduleId;
    `);
}

/**
 * Áp dụng voucher cho booking và tính toán giá cuối cùng
 */
async function applyVoucherToBooking(bookedScheduleId, voucherCode) {
  const pool = await getPool();

  // Kiểm tra voucher hợp lệ
  const voucher = await pool.request()
    .input("VoucherCode", sql.NVarChar(50), voucherCode)
    .query(`
      SELECT * FROM Vouchers
      WHERE VoucherCode = @VoucherCode
        AND Status = 'ACTIVE'
        AND GETDATE() BETWEEN StartDate AND EndDate
        AND UsedCount < MaxUsage
    `);

  if (voucher.recordset.length === 0) {
    throw new Error("Voucher không hợp lệ hoặc đã hết hạn");
  }

  const voucherData = voucher.recordset[0];

  // Lấy thông tin booking hiện tại
  const booking = await getBookedScheduleById(bookedScheduleId);
  if (!booking) {
    throw new Error("Booking không tồn tại");
  }

  if (booking.VoucherId) {
    throw new Error("Booking đã có voucher áp dụng");
  }

  // Kiểm tra giá trị combo tối thiểu
  if (booking.OriginalPrice < voucherData.MinComboValue) {
    throw new Error(`Giá trị combo tối thiểu để áp dụng voucher là ${voucherData.MinComboValue}`);
  }

  // Tính toán giá mới
  const discountAmount = Math.floor(booking.OriginalPrice * voucherData.DiscountPercentage / 100);
  const newTotalAmount = booking.OriginalPrice - discountAmount;

  // Cập nhật booking với voucher
  await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .input("VoucherId", sql.UniqueIdentifier, voucherData.VoucherId)
    .input("DiscountPercentages", sql.Int, voucherData.DiscountPercentage)
    .input("TotalAmount", sql.Int, newTotalAmount)
    .query(`
      UPDATE BookedSchedules
      SET VoucherId = @VoucherId,
          DiscountPercentages = @DiscountPercentages,
          TotalAmount = @TotalAmount,
          updated_at = GETDATE()
      WHERE BookedScheduleId = @BookedScheduleId
    `);

  // Tăng UsedCount của voucher
  await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherData.VoucherId)
    .query(`
      UPDATE Vouchers
      SET UsedCount = UsedCount + 1
      WHERE VoucherId = @VoucherId
    `);

  return await getBookedScheduleById(bookedScheduleId);
}

/**
 * Hủy áp dụng voucher từ booking
 */
async function removeVoucherFromBooking(bookedScheduleId) {
  const pool = await getPool();

  // Lấy thông tin booking hiện tại
  const booking = await getBookedScheduleById(bookedScheduleId);
  if (!booking) {
    throw new Error("Booking không tồn tại");
  }

  if (!booking.VoucherId) {
    throw new Error("Booking chưa có voucher áp dụng");
  }

  // Khôi phục giá gốc
  const originalPrice = booking.OriginalPrice || booking.TotalAmount;

  // Cập nhật booking - xóa voucher
  await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      UPDATE BookedSchedules
      SET VoucherId = NULL,
          DiscountPercentages = 0,
          TotalAmount = OriginalPrice,
          updated_at = GETDATE()
      WHERE BookedScheduleId = @BookedScheduleId
    `);

  // Giảm UsedCount của voucher
  await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, booking.VoucherId)
    .query(`
      UPDATE Vouchers
      SET UsedCount = CASE WHEN UsedCount > 0 THEN UsedCount - 1 ELSE 0 END
      WHERE VoucherId = @VoucherId
    `);

  return await getBookedScheduleById(bookedScheduleId);
}

/**
 * Lấy thống kê bookings theo khoảng thời gian
 */
async function getBookingStats({ startDate, endDate, barPageId } = {}) {
  const pool = await getPool();
  const request = pool.request();

  let whereClause = "1=1";

  if (startDate) {
    request.input("StartDate", sql.DateTime, new Date(startDate));
    whereClause += " AND bs.created_at >= @StartDate";
  }

  if (endDate) {
    request.input("EndDate", sql.DateTime, new Date(endDate));
    whereClause += " AND bs.created_at <= @EndDate";
  }

  if (barPageId) {
    request.input("BarPageId", sql.UniqueIdentifier, barPageId);
    whereClause += " AND bs.ReceiverId = @BarPageId";
  }

  const result = await request.query(`
    SELECT
      COUNT(*) as totalBookings,
      SUM(bs.TotalAmount) as totalRevenue,
      SUM(bs.OriginalPrice) as totalOriginalRevenue,
      SUM(bs.OriginalPrice - bs.TotalAmount) as totalDiscountAmount,
      COUNT(CASE WHEN bs.VoucherId IS NOT NULL THEN 1 END) as bookingsWithVoucher,
      AVG(bs.TotalAmount) as averageBookingValue,
      COUNT(DISTINCT bs.BookerId) as uniqueCustomers
    FROM BookedSchedules bs
    WHERE ${whereClause} AND bs.PaymentStatus = 'paid'
  `);

  return result.recordset[0] || {
    totalBookings: 0,
    totalRevenue: 0,
    totalOriginalRevenue: 0,
    totalDiscountAmount: 0,
    bookingsWithVoucher: 0,
    averageBookingValue: 0,
    uniqueCustomers: 0
  };
}

/**
 * Tính toán amounts cho booking với combo và voucher
 */
function calculateBookingAmounts(originalComboPrice, discountPercentage = 0) {
  // Tính discount amount
  const discountAmount = Math.floor(originalComboPrice * discountPercentage / 100);

  // Số tiền thực tế thanh toán (sau khi áp dụng voucher)
  const finalPaymentAmount = originalComboPrice - discountAmount;

  // Hoa hồng hệ thống 15% (tính trên giá combo gốc)
  const commissionAmount = Math.floor(originalComboPrice * 0.15);

  // Số tiền bar nhận được (giá combo gốc - hoa hồng hệ thống)
  const barReceiveAmount = originalComboPrice - commissionAmount;

  return {
    originalPrice: originalComboPrice,
    discountPercentages: discountPercentage,
    discountAmount,
    finalPaymentAmount,
    commissionAmount,
    barReceiveAmount
  };
}

/**
 * Tạo booking mới với combo và voucher
 */
async function createBookedScheduleWithCombo({
  bookerId,
  receiverId,
  voucherId = null,
  type = "BarTable",
  originalComboPrice,
  discountPercentages = 0,
  finalPaymentAmount,
  // commissionAmount, barReceiveAmount: DB hiện tại không có cột tương ứng, sẽ compute khi cần
  bookingDate,
  startTime,
  endTime,
  mongoDetailId = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookerId", sql.UniqueIdentifier, bookerId)
    .input("ReceiverId", sql.UniqueIdentifier, receiverId)
    .input("VoucherId", sql.UniqueIdentifier, voucherId || null)
    .input("Type", sql.NVarChar(100), type)
    .input("OriginalPrice", sql.Int, originalComboPrice)
    .input("TotalAmount", sql.Int, finalPaymentAmount)
    .input("DiscountPercentages", sql.Int, discountPercentages)
    .input("PaymentStatus", sql.NVarChar(20), "Pending")
    .input("ScheduleStatus", sql.NVarChar(20), "Pending")
    .input("BookingDate", sql.DateTime, toDateOrNull(bookingDate))
    .input("StartTime", sql.DateTime, toDateOrNull(startTime))
    .input("EndTime", sql.DateTime, toDateOrNull(endTime))
    .input("MongoDetailId", sql.NVarChar(50), mongoDetailId || null)
    .query(`
      INSERT INTO BookedSchedules (
        BookerId,
        ReceiverId,
        VoucherId,
        Type,
        OriginalPrice,
        TotalAmount,
        DiscountPercentages,
        PaymentStatus,
        ScheduleStatus,
        BookingDate,
        StartTime,
        EndTime,
        MongoDetailId
      )
      OUTPUT
        inserted.BookedScheduleId,
        inserted.BookerId,
        inserted.ReceiverId,
        inserted.VoucherId,
        inserted.Type,
        inserted.OriginalPrice,
        inserted.TotalAmount,
        inserted.DiscountPercentages,
        inserted.PaymentStatus,
        inserted.ScheduleStatus,
        inserted.BookingDate,
        inserted.StartTime,
        inserted.EndTime,
        inserted.MongoDetailId,
        inserted.ReviewStatus,
        inserted.RefundStatus,
        inserted.created_at
      VALUES (
        @BookerId,
        @ReceiverId,
        @VoucherId,
        @Type,
        @OriginalPrice,
        @TotalAmount,
        @DiscountPercentages,
        @PaymentStatus,
        @ScheduleStatus,
        @BookingDate,
        @StartTime,
        @EndTime,
        @MongoDetailId
      );
    `);

  return result.recordset[0];
}

/**
 * Cập nhật QR code cho booking
 */
async function updateBookingQRCode(bookedScheduleId, qrCode) {
  const pool = await getPool();
  // BookedSchedules table không có cột QRCode trong DB hiện tại.
  // QRCode được lưu ở MongoDB (DetailSchedule) nên hàm này giữ lại để backward compatibility.
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT TOP 1 * FROM BookedSchedules WHERE BookedScheduleId = @BookedScheduleId
    `);
  return result.recordset[0] || null;
}

/**
 * Cập nhật thời gian confirm của bar
 */
async function updateBookingConfirmation(bookedScheduleId, confirmedAt = new Date()) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      UPDATE BookedSchedules
      SET ScheduleStatus = 'Confirmed',
          updated_at = GETDATE()
      OUTPUT inserted.*
      WHERE BookedScheduleId = @BookedScheduleId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy booking với thông tin combo và voucher
 */
async function getBookedScheduleWithDetails(bookedScheduleId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT
        bs.*,
        -- Thông tin voucher
        v.VoucherName,
        v.VoucherCode,
        v.DiscountPercentage AS VoucherDiscountPercentage,
        -- Thông tin bar
        bp.BarName,
        bp.Address AS BarAddress,
        -- Thông tin người đặt
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS BookerAvatar,
        NULL AS BookerPhone
      FROM BookedSchedules bs
      LEFT JOIN Vouchers v ON bs.VoucherId = v.VoucherId
      LEFT JOIN BarPages bp ON bs.ReceiverId = bp.BarPageId
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      WHERE bs.BookedScheduleId = @BookedScheduleId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy thống kê booking với combo/voucher
 */
async function getBookingStatsWithRevenue({ startDate, endDate, barPageId } = {}) {
  const pool = await getPool();
  const request = pool.request();

  let whereClause = "1=1";

  if (startDate) {
    request.input("StartDate", sql.DateTime, new Date(startDate));
    whereClause += " AND bs.created_at >= @StartDate";
  }

  if (endDate) {
    request.input("EndDate", sql.DateTime, new Date(endDate));
    whereClause += " AND bs.created_at <= @EndDate";
  }

  if (barPageId) {
    request.input("BarPageId", sql.UniqueIdentifier, barPageId);
    whereClause += " AND bs.ReceiverId = @BarPageId";
  }

  const result = await request.query(`
    SELECT
      COUNT(*) as totalBookings,
      SUM(bs.TotalAmount) as totalRevenue, -- Doanh thu thực tế từ khách
      SUM(bs.OriginalPrice) as totalOriginalRevenue, -- Tổng giá combo gốc
      SUM(bs.OriginalPrice - bs.TotalAmount) as totalDiscountAmount, -- Tổng tiền giảm giá
      SUM(CAST(bs.OriginalPrice * 0.15 AS INT)) as totalCommissionAmount, -- Tổng hoa hồng hệ thống (15% giá gốc)
      SUM(bs.OriginalPrice - CAST(bs.OriginalPrice * 0.15 AS INT)) as totalBarReceiveAmount, -- Tổng tiền bar nhận
      COUNT(CASE WHEN bs.VoucherId IS NOT NULL THEN 1 END) as bookingsWithVoucher,
      COUNT(CASE WHEN bs.ScheduleStatus = 'Confirmed' THEN 1 END) as confirmedBookings,
      AVG(bs.TotalAmount) as averageBookingValue,
      COUNT(DISTINCT bs.BookerId) as uniqueCustomers
    FROM BookedSchedules bs
    WHERE ${whereClause} AND bs.PaymentStatus = 'Paid'
  `);

  return result.recordset[0] || {
    totalBookings: 0,
    totalRevenue: 0,
    totalOriginalRevenue: 0,
    totalDiscountAmount: 0,
    totalCommissionAmount: 0,
    totalBarReceiveAmount: 0,
    bookingsWithVoucher: 0,
    confirmedBookings: 0,
    averageBookingValue: 0,
    uniqueCustomers: 0
  };
}

/**
 * Lấy bookings chưa được bar confirm (có QR code nhưng chưa scan)
 */
async function getUnconfirmedBookings(barPageId, { limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset)
    .query(`
      SELECT
        bs.*,
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        NULL AS BookerPhone
      FROM BookedSchedules bs
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      WHERE bs.ReceiverId = @BarPageId
        AND (bs.ScheduleStatus IS NULL OR bs.ScheduleStatus <> 'Confirmed')
        AND bs.PaymentStatus = 'Paid'
      ORDER BY bs.created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY
    `);
  return result.recordset;
}

module.exports = {
  createBookedSchedule,
  getBookedScheduleById,
  getBookedSchedulesByBooker,
  getBookedSchedulesByReceiver,
  getBookedSchedulesByRefundStatus,
  updateBookedScheduleStatuses,
  updateBookingAmounts,
  updateBookedScheduleTiming,
  updateRefundStatus,
  getPendingBookingsOlderThan,
  deleteBookedSchedule,
  applyVoucherToBooking,
  removeVoucherFromBooking,
  getBookingStats,
  // New functions for combo/voucher system
  calculateBookingAmounts,
  createBookedScheduleWithCombo,
  updateBookingQRCode,
  updateBookingConfirmation,
  getBookedScheduleWithDetails,
  getBookingStatsWithRevenue,
  getUnconfirmedBookings
};
