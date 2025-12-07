const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo payment history record
 */
async function createPaymentHistory({
  type = 'ad_package',
  senderId, // BarPage AccountId
  receiverId = null, // NULL hoặc system account
  transferContent,
  transferAmount
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Type", sql.NVarChar(100), type)
    .input("SenderId", sql.UniqueIdentifier, senderId)
    .input("ReceiverId", sql.UniqueIdentifier, receiverId || null)
    .input("TransferContent", sql.NVarChar(sql.MAX), transferContent)
    .input("TransferAmount", sql.Decimal(18,2), transferAmount)
    .query(`
      INSERT INTO PaymentHistories
        (PaymentHistoryId, Type, SenderId, ReceiverId, TransferContent, TransferAmount, created_at)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @Type, @SenderId, @ReceiverId, @TransferContent, @TransferAmount, GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Lấy payment history của user
 */
async function getPaymentHistoryBySender(senderId, limit = 50) {
  const pool = await getPool();
  const result = await pool.request()
    .input("SenderId", sql.UniqueIdentifier, senderId)
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit) *
      FROM PaymentHistories
      WHERE SenderId = @SenderId
      ORDER BY created_at DESC
    `);
  return result.recordset;
}

/**
 * Lấy payment history theo ID
 */
async function findById(paymentHistoryId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PaymentHistoryId", sql.UniqueIdentifier, paymentHistoryId)
    .query("SELECT TOP 1 * FROM PaymentHistories WHERE PaymentHistoryId = @PaymentHistoryId");
  return result.recordset[0] || null;
}

/**
 * Lấy số tiền cọc từ PaymentHistory cho booking
 * @param {string} senderId - BookerId (EntityAccountId)
 * @param {string} bookedScheduleId - BookedScheduleId để tìm payment history liên quan
 * @param {Date} bookingDate - Ngày booking để tìm payment history gần nhất
 * @returns {number|null} Số tiền cọc hoặc null nếu không tìm thấy
 */
async function getDepositAmountByBooking(senderId, bookedScheduleId, bookingDate = null) {
  const pool = await getPool();
  try {
    // Tìm payment history với type = 'booking', senderId = BookerId, receiverId = NULL (platform giữ tiền cọc)
    // Ưu tiên payment history gần với thời gian booking
    let query = `
      SELECT TOP 1 TransferAmount, created_at
      FROM PaymentHistories
      WHERE Type = 'booking'
        AND SenderId = @SenderId
        AND ReceiverId IS NULL
        AND TransferContent LIKE '%booking%'
    `;
    
    const request = pool.request()
      .input("SenderId", sql.UniqueIdentifier, senderId);
    
    // Nếu có bookingDate, tìm payment history trong khoảng thời gian hợp lý (trước và sau booking date)
    if (bookingDate) {
      const bookingDateObj = new Date(bookingDate);
      const beforeDate = new Date(bookingDateObj);
      beforeDate.setDate(beforeDate.getDate() - 7); // 7 ngày trước booking
      const afterDate = new Date(bookingDateObj);
      afterDate.setDate(afterDate.getDate() + 1); // 1 ngày sau booking
      
      request.input("BeforeDate", sql.DateTime, beforeDate);
      request.input("AfterDate", sql.DateTime, afterDate);
      
      query += ` AND created_at >= @BeforeDate AND created_at <= @AfterDate`;
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await request.query(query);
    
    if (result.recordset.length > 0) {
      const amount = parseFloat(result.recordset[0].TransferAmount);
      return isNaN(amount) ? null : amount;
    }
    
    // Nếu không tìm thấy với bookingDate, thử tìm payment history gần nhất
    if (bookingDate) {
      const fallbackResult = await pool.request()
        .input("SenderId", sql.UniqueIdentifier, senderId)
        .query(`
          SELECT TOP 1 TransferAmount
          FROM PaymentHistories
          WHERE Type = 'booking'
            AND SenderId = @SenderId
            AND ReceiverId IS NULL
            AND TransferContent LIKE '%booking%'
          ORDER BY created_at DESC
        `);
      
      if (fallbackResult.recordset.length > 0) {
        const amount = parseFloat(fallbackResult.recordset[0].TransferAmount);
        return isNaN(amount) ? null : amount;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[paymentHistoryModel] Error getting deposit amount:', error);
    return null;
  }
}

module.exports = {
  createPaymentHistory,
  getPaymentHistoryBySender,
  findById,
  getDepositAmountByBooking
};


