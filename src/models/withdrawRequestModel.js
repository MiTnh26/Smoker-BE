const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo yêu cầu rút tiền
 */
async function createWithdrawRequest({ walletId, amount, bankInfoId }, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .query(`
      INSERT INTO WithdrawRequests 
        (WithdrawRequestId, WalletId, Amount, BankInfoId, Status, RequestedAt)
      OUTPUT inserted.*
      VALUES 
        (NEWID(), @WalletId, @Amount, @BankInfoId, 'pending', GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Lấy yêu cầu rút tiền theo ID
 */
async function getWithdrawRequestById(withdrawRequestId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("WithdrawRequestId", sql.UniqueIdentifier, withdrawRequestId)
    .query(`
      SELECT 
        wr.WithdrawRequestId, wr.WalletId, wr.Amount, wr.BankInfoId,
        wr.Status, wr.RequestedAt, wr.ReviewedAt, wr.ReviewedBy, wr.Note, wr.TransferProofImage,
        bi.BankName, bi.AccountNumber, bi.AccountHolderName
      FROM WithdrawRequests wr
      LEFT JOIN BankInfo bi ON wr.BankInfoId = bi.BankInfoId
      WHERE wr.WithdrawRequestId = @WithdrawRequestId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy danh sách yêu cầu rút tiền theo WalletId
 */
async function getWithdrawRequestsByWalletId(walletId, { limit = 50, offset = 0, status = null } = {}) {
  const pool = await getPool();
  let query = `
    SELECT 
      wr.WithdrawRequestId, wr.Amount, wr.Status, wr.RequestedAt,
      wr.ReviewedAt, wr.Note, bi.BankName, bi.AccountNumber, bi.AccountHolderName
    FROM WithdrawRequests wr
    LEFT JOIN BankInfo bi ON wr.BankInfoId = bi.BankInfoId
    WHERE wr.WalletId = @WalletId
  `;
  
  const request = pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  if (status) {
    query += ` AND wr.Status = @Status`;
    request.input("Status", sql.NVarChar(20), status);
  }
  
  query += ` ORDER BY wr.RequestedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY`;
  
  const result = await request.query(query);
  return result.recordset;
}

/**
 * Lấy tất cả yêu cầu rút tiền (cho admin/kế toán)
 */
async function getAllWithdrawRequests({ limit = 50, status = null } = {}) {
  const pool = await getPool();
  let query = `
    SELECT TOP (@Limit)
      wr.WithdrawRequestId, wr.WalletId, wr.Amount, wr.Status,
      wr.RequestedAt, wr.ReviewedAt, wr.Note, wr.TransferProofImage,
      bi.BankName, bi.AccountNumber, bi.AccountHolderName,
      ea.EntityType, ea.EntityId
    FROM WithdrawRequests wr
    LEFT JOIN BankInfo bi ON wr.BankInfoId = bi.BankInfoId
    LEFT JOIN Wallets w ON wr.WalletId = w.WalletId
    LEFT JOIN EntityAccounts ea ON w.EntityAccountId = ea.EntityAccountId
    WHERE 1=1
  `;
  
  const request = pool.request()
    .input("Limit", sql.Int, limit);
  
  if (status) {
    query += ` AND wr.Status = @Status`;
    request.input("Status", sql.NVarChar(20), status);
  }
  
  query += ` ORDER BY wr.RequestedAt DESC`;
  
  const result = await request.query(query);
  return result.recordset;
}

/**
 * Duyệt yêu cầu rút tiền
 */
async function approveWithdrawRequest(withdrawRequestId, reviewedBy, note = null, transferProofImage = null, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WithdrawRequestId", sql.UniqueIdentifier, withdrawRequestId)
    .input("ReviewedBy", sql.UniqueIdentifier, reviewedBy)
    .input("Note", sql.NVarChar(500), note)
    .input("TransferProofImage", sql.NVarChar(500), transferProofImage)
    .query(`
      UPDATE WithdrawRequests
      SET Status = 'approved',
          ReviewedAt = GETDATE(),
          ReviewedBy = @ReviewedBy,
          Note = @Note,
          TransferProofImage = @TransferProofImage
      OUTPUT inserted.*
      WHERE WithdrawRequestId = @WithdrawRequestId
        AND Status = 'pending'
    `);
  return result.recordset[0];
}

/**
 * Từ chối yêu cầu rút tiền
 */
async function rejectWithdrawRequest(withdrawRequestId, reviewedBy, note, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WithdrawRequestId", sql.UniqueIdentifier, withdrawRequestId)
    .input("ReviewedBy", sql.UniqueIdentifier, reviewedBy)
    .input("Note", sql.NVarChar(500), note)
    .query(`
      UPDATE WithdrawRequests
      SET Status = 'rejected',
          ReviewedAt = GETDATE(),
          ReviewedBy = @ReviewedBy,
          Note = @Note
      OUTPUT inserted.*
      WHERE WithdrawRequestId = @WithdrawRequestId
        AND Status = 'pending'
    `);
  return result.recordset[0];
}

module.exports = {
  createWithdrawRequest,
  getWithdrawRequestById,
  getWithdrawRequestsByWalletId,
  getAllWithdrawRequests,
  approveWithdrawRequest,
  rejectWithdrawRequest
};

