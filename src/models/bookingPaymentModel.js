const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo booking payment mới
 */
async function createBookingPayment({ bookedScheduleId, orderCode }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Id", sql.UniqueIdentifier, null) // Will use NEWID()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .input("OrderCode", sql.BigInt, orderCode)
    .query(`
      INSERT INTO BookingPayments
        (Id, BookedScheduleId, OrderCode, CreatedAt)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @BookedScheduleId, @OrderCode, GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Tìm booking payment theo ID
 */
async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Id", sql.UniqueIdentifier, id)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.BookerId,
        bs.ReceiverId,
        bs.MongoDetailId
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      WHERE bp.Id = @Id
    `);
  return result.recordset[0] || null;
}

/**
 * Tìm booking payment theo OrderCode
 */
async function findByOrderCode(orderCode) {
  const pool = await getPool();
  const result = await pool.request()
    .input("OrderCode", sql.BigInt, orderCode)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.BookerId,
        bs.ReceiverId,
        bs.MongoDetailId
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      WHERE bp.OrderCode = @OrderCode
    `);
  return result.recordset[0] || null;
}

/**
 * Tìm booking payment theo BookedScheduleId
 */
async function findByBookedScheduleId(bookedScheduleId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.BookerId,
        bs.ReceiverId,
        bs.MongoDetailId
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      WHERE bp.BookedScheduleId = @BookedScheduleId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả booking payments với filter
 */
async function getAllBookingPayments({ limit = 50, offset = 0, orderBy = 'CreatedAt', orderDirection = 'DESC' } = {}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.BookerId,
        bs.ReceiverId,
        bs.MongoDetailId,
        -- Booker info
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS BookerAvatar,
        -- Receiver info
        CASE
          WHEN bs.Type = 'business' THEN ba2.UserName
          ELSE a2.UserName
        END AS ReceiverName,
        CASE
          WHEN bs.Type = 'business' THEN ba2.Avatar
          ELSE a2.Avatar
        END AS ReceiverAvatar
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      LEFT JOIN EntityAccounts ea2 ON bs.ReceiverId = ea2.EntityAccountId
      LEFT JOIN Accounts a2 ON ea2.AccountId = a2.AccountId
      LEFT JOIN BussinessAccounts ba2 ON bs.ReceiverId = ba2.BussinessAccountId
      ORDER BY bp.${orderBy} ${orderDirection}
      OFFSET @Offset ROWS
      FETCH NEXT @Limit ROWS ONLY
    `);
  return result.recordset;
}

/**
 * Lấy booking payments theo BookerId
 */
async function getByBookerId(bookerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookerId", sql.UniqueIdentifier, bookerId)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.ReceiverId,
        bs.MongoDetailId,
        -- Receiver info
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS ReceiverName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS ReceiverAvatar
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      LEFT JOIN EntityAccounts ea ON bs.ReceiverId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.ReceiverId = ba.BussinessAccountId
      WHERE bs.BookerId = @BookerId
      ORDER BY bp.CreatedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy booking payments theo ReceiverId
 */
async function getByReceiverId(receiverId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ReceiverId", sql.UniqueIdentifier, receiverId)
    .query(`
      SELECT bp.*,
        bs.Type,
        bs.TotalAmount,
        bs.PaymentStatus,
        bs.ScheduleStatus,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.BookerId,
        bs.MongoDetailId,
        -- Booker info
        CASE
          WHEN bs.Type = 'business' THEN ba.UserName
          ELSE a.UserName
        END AS BookerName,
        CASE
          WHEN bs.Type = 'business' THEN ba.Avatar
          ELSE a.Avatar
        END AS BookerAvatar
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      LEFT JOIN EntityAccounts ea ON bs.BookerId = ea.EntityAccountId
      LEFT JOIN Accounts a ON ea.AccountId = a.AccountId
      LEFT JOIN BussinessAccounts ba ON bs.BookerId = ba.BussinessAccountId
      WHERE bs.ReceiverId = @ReceiverId
      ORDER BY bp.CreatedAt DESC
    `);
  return result.recordset;
}

/**
 * Đếm tổng số booking payments
 */
async function countBookingPayments() {
  const pool = await getPool();
  const result = await pool.request()
    .query("SELECT COUNT(*) as total FROM BookingPayments");
  return result.recordset[0]?.total || 0;
}

/**
 * Lấy thống kê booking payments
 */
async function getBookingPaymentStats() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      SELECT
        COUNT(*) as totalPayments,
        SUM(bs.TotalAmount) as totalRevenue,
        AVG(bs.TotalAmount) as averagePayment,
        COUNT(DISTINCT bs.BookerId) as uniqueBookers,
        COUNT(DISTINCT bs.ReceiverId) as uniqueReceivers
      FROM BookingPayments bp
      INNER JOIN BookedSchedules bs ON bp.BookedScheduleId = bs.BookedScheduleId
      WHERE bs.PaymentStatus = 'paid'
    `);
  return result.recordset[0] || {
    totalPayments: 0,
    totalRevenue: 0,
    averagePayment: 0,
    uniqueBookers: 0,
    uniqueReceivers: 0
  };
}

module.exports = {
  createBookingPayment,
  findById,
  findByOrderCode,
  findByBookedScheduleId,
  getAllBookingPayments,
  getByBookerId,
  getByReceiverId,
  countBookingPayments,
  getBookingPaymentStats
};




