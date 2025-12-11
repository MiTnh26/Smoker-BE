
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
  totalAmount = 0,
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
    .input("TotalAmount", sql.Int, totalAmount || 0)
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
        TotalAmount,
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
        inserted.TotalAmount,
        inserted.PaymentStatus,
        inserted.ScheduleStatus,
        inserted.BookingDate,
        inserted.StartTime,
        inserted.EndTime,
        inserted.MongoDetailId,
        inserted.created_at
      VALUES (
        @BookerId,
        @ReceiverId,
        @Type,
        @TotalAmount,
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

async function getBookedSchedulesByBooker(bookerId, { limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookerId", sql.UniqueIdentifier, bookerId)
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
      WHERE BookerId = @BookerId
      ORDER BY created_at DESC
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
      ${whereClause}
      ORDER BY created_at DESC
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

module.exports = {
  createBookedSchedule,
  getBookedScheduleById,
  getBookedSchedulesByBooker,
  getBookedSchedulesByReceiver,
  getBookedSchedulesByRefundStatus,
  updateBookedScheduleStatuses,
  updateBookedScheduleTiming,
  updateRefundStatus
};
