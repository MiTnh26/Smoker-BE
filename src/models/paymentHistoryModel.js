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

module.exports = {
  createPaymentHistory,
  getPaymentHistoryBySender,
  findById
};


