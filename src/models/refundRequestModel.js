const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo yêu cầu hoàn tiền
 */
async function createRefundRequest({
  bookedScheduleId,
  userId,
  amount,
  reason = null
}) {
  const pool = await getPool();
  const crypto = require('crypto');
  const refundRequestId = crypto.randomUUID();
  
  await pool.request()
    .input("RefundRequestId", sql.UniqueIdentifier, refundRequestId)
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .input("UserId", sql.UniqueIdentifier, userId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .input("Reason", sql.NVarChar(sql.MAX), reason || null)
    .query(`
      INSERT INTO RefundRequests
        (RefundRequestId, BookedScheduleId, UserId, Amount, Reason, Status, RequestedAt)
      VALUES
        (@RefundRequestId, @BookedScheduleId, @UserId, @Amount, @Reason, 'pending', GETDATE())
    `);
  
  return await findById(refundRequestId);
}

/**
 * Tìm refund request theo ID
 */
async function findById(refundRequestId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("RefundRequestId", sql.UniqueIdentifier, refundRequestId)
    .query(`
      SELECT rr.*,
        bs.BookingDate,
        bs.StartTime,
        bs.EndTime,
        bs.TotalAmount,
        a.UserName,
        a.Email AS UserEmail,
        processor.UserName AS ProcessorName,
        processor.Email AS ProcessorEmail
      FROM RefundRequests rr
      INNER JOIN BookedSchedules bs ON rr.BookedScheduleId = bs.BookedScheduleId
      LEFT JOIN Accounts a ON rr.UserId = a.AccountId
      LEFT JOIN Accounts processor ON rr.ProcessedBy = processor.AccountId
      WHERE rr.RefundRequestId = @RefundRequestId
    `);
  return result.recordset[0] || null;
}

/**
 * Tìm refund request theo BookedScheduleId
 */
async function findByBookedScheduleId(bookedScheduleId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT rr.*
      FROM RefundRequests rr
      WHERE rr.BookedScheduleId = @BookedScheduleId
      ORDER BY rr.RequestedAt DESC
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả refund requests với filter
 */
async function getAllRefundRequests({ 
  status, 
  userId,
  limit = 50, 
  offset = 0 
} = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("rr.Status = @Status");
  }
  
  if (userId) {
    request.input("UserId", sql.UniqueIdentifier, userId);
    whereConditions.push("rr.UserId = @UserId");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT rr.*,
      bs.BookingDate,
      bs.StartTime,
      bs.EndTime,
      bs.TotalAmount,
      a.UserName,
      a.Email AS UserEmail
    FROM RefundRequests rr
    INNER JOIN BookedSchedules bs ON rr.BookedScheduleId = bs.BookedScheduleId
    LEFT JOIN Accounts a ON rr.UserId = a.AccountId
    ${whereClause}
    ORDER BY rr.RequestedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}


/**
 * Kế toán xử lý hoàn tiền
 */
async function processRefund(refundRequestId, accountantId, { 
  transferProofImage, 
  transferNote 
} = {}) {
  const pool = await getPool();
  await pool.request()
    .input("RefundRequestId", sql.UniqueIdentifier, refundRequestId)
    .input("AccountantId", sql.UniqueIdentifier, accountantId)
    .input("TransferProofImage", sql.NVarChar(500), transferProofImage || null)
    .input("TransferNote", sql.NVarChar(sql.MAX), transferNote || null)
    .query(`
      UPDATE RefundRequests
      SET ProcessedBy = @AccountantId,
          ProcessedAt = GETDATE(),
          TransferProofImage = @TransferProofImage,
          TransferNote = @TransferNote,
          Status = 'completed'
      WHERE RefundRequestId = @RefundRequestId
    `);
  
  return await findById(refundRequestId);
}

/**
 * Từ chối refund request
 */
async function rejectRefund(refundRequestId, rejectedReason) {
  const pool = await getPool();
  await pool.request()
    .input("RefundRequestId", sql.UniqueIdentifier, refundRequestId)
    .input("RejectedReason", sql.NVarChar(sql.MAX), rejectedReason)
    .query(`
      UPDATE RefundRequests
      SET Status = 'rejected',
          RejectedReason = @RejectedReason
      WHERE RefundRequestId = @RefundRequestId
    `);
  
  return await findById(refundRequestId);
}

module.exports = {
  createRefundRequest,
  findById,
  findByBookedScheduleId,
  getAllRefundRequests,
  processRefund,
  rejectRefund
};
