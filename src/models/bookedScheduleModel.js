
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
        created_at
      FROM BookedSchedules
      ${whereClause}
      ORDER BY created_at DESC
      OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
    `);

  return result.recordset;
}

async function updateBookedScheduleStatuses(bookedScheduleId, { paymentStatus, scheduleStatus }) {
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
  }

  if (scheduleStatus !== undefined) {
    request.input("ScheduleStatus", sql.NVarChar(20), scheduleStatus);
    setClauses.push("ScheduleStatus = @ScheduleStatus");
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

module.exports = {
  createBookedSchedule,
  getBookedScheduleById,
  getBookedSchedulesByBooker,
  getBookedSchedulesByReceiver,
  updateBookedScheduleStatuses,
  updateBookedScheduleTiming
};
