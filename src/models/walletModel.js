const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo wallet mới cho EntityAccount
 */
async function createWallet(entityAccountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
    .query(`
      INSERT INTO Wallets (WalletId, EntityAccountId, Balance, LockedBalance, Status)
      OUTPUT inserted.*
      VALUES (NEWID(), @EntityAccountId, 0.00, 0.00, 'active')
    `);
  return result.recordset[0];
}

/**
 * Lấy wallet theo EntityAccountId (bao gồm thông tin PIN)
 */
async function getWalletByEntityAccountId(entityAccountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
    .query(`
      SELECT WalletId, EntityAccountId, Balance, LockedBalance, Status, 
             PinHash, PinFailedCount, PinLockedUntil, CreatedAt, UpdatedAt
      FROM Wallets
      WHERE EntityAccountId = @EntityAccountId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy wallet theo WalletId (bao gồm thông tin PIN)
 */
async function getWalletById(walletId, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .query(`
      SELECT WalletId, EntityAccountId, Balance, LockedBalance, Status,
             PinHash, PinFailedCount, PinLockedUntil, CreatedAt, UpdatedAt
      FROM Wallets
      WHERE WalletId = @WalletId
    `);
  return result.recordset[0] || null;
}

/**
 * Cập nhật balance (atomic operation với transaction)
 */
async function updateBalance(walletId, amount, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .query(`
      UPDATE Wallets
      SET Balance = Balance + @Amount,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
    `);
  return result.recordset[0];
}

/**
 * Khóa tiền (lock balance) khi tạo withdraw request
 */
async function lockBalance(walletId, amount, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .query(`
      UPDATE Wallets
      SET Balance = Balance - @Amount,
          LockedBalance = LockedBalance + @Amount,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
        AND Balance >= @Amount
    `);
  return result.recordset[0];
}

/**
 * Mở khóa tiền (unlock balance) khi withdraw bị từ chối
 */
async function unlockBalance(walletId, amount, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .query(`
      UPDATE Wallets
      SET Balance = Balance + @Amount,
          LockedBalance = LockedBalance - @Amount,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
        AND LockedBalance >= @Amount
    `);
  return result.recordset[0];
}

/**
 * Giải phóng locked balance khi withdraw được duyệt
 */
async function releaseLockedBalance(walletId, amount, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Amount", sql.Decimal(18, 2), amount)
    .query(`
      UPDATE Wallets
      SET LockedBalance = LockedBalance - @Amount,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
        AND LockedBalance >= @Amount
    `);
  return result.recordset[0];
}

/**
 * Tạo transaction record
 */
async function createTransaction({
  walletId,
  transactionType,
  amount,
  balanceBefore,
  balanceAfter,
  sourceType = null,
  sourceId = null,
  status = 'completed',
  description = null
}, transaction = null) {
  const pool = transaction || await getPool();
  const request = transaction ? transaction.request() : pool.request();
  
  const result = await request
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("TransactionType", sql.NVarChar(50), transactionType)
    .input("Amount", sql.Decimal(18, 2), amount)
    .input("BalanceBefore", sql.Decimal(18, 2), balanceBefore)
    .input("BalanceAfter", sql.Decimal(18, 2), balanceAfter)
    .input("SourceType", sql.NVarChar(50), sourceType)
    .input("SourceId", sql.UniqueIdentifier, sourceId)
    .input("Status", sql.NVarChar(20), status)
    .input("Description", sql.NVarChar(500), description)
    .query(`
      INSERT INTO WalletTransactions 
        (TransactionId, WalletId, TransactionType, Amount, BalanceBefore, BalanceAfter,
         SourceType, SourceId, Status, Description, CreatedAt)
      OUTPUT inserted.*
      VALUES 
        (NEWID(), @WalletId, @TransactionType, @Amount, @BalanceBefore, @BalanceAfter,
         @SourceType, @SourceId, @Status, @Description, GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Lấy lịch sử giao dịch
 */
async function getTransactions(walletId, { limit = 50, offset = 0, type = null, status = null } = {}) {
  const pool = await getPool();
  let query = `
    SELECT 
      TransactionId, TransactionType, Amount, BalanceBefore, BalanceAfter,
      SourceType, SourceId, Status, Description, CreatedAt
    FROM WalletTransactions
    WHERE WalletId = @WalletId
  `;
  
  const request = pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  if (type) {
    query += ` AND TransactionType = @Type`;
    request.input("Type", sql.NVarChar(50), type);
  }
  
  if (status) {
    query += ` AND Status = @Status`;
    request.input("Status", sql.NVarChar(20), status);
  }
  
  query += ` ORDER BY CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY`;
  
  const result = await request.query(query);
  return result.recordset;
}

/**
 * Tính tổng số giao dịch (cho pagination)
 */
async function countTransactions(walletId, { type = null, status = null } = {}) {
  const pool = await getPool();
  let query = `SELECT COUNT(*) as Total FROM WalletTransactions WHERE WalletId = @WalletId`;
  
  const request = pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId);
  
  if (type) {
    query += ` AND TransactionType = @Type`;
    request.input("Type", sql.NVarChar(50), type);
  }
  
  if (status) {
    query += ` AND Status = @Status`;
    request.input("Status", sql.NVarChar(20), status);
  }
  
  const result = await request.query(query);
  return result.recordset[0]?.Total || 0;
}

/**
 * Set PIN cho wallet (chỉ khi chưa có PIN)
 */
async function setWalletPin(walletId, pinHash) {
  const pool = await getPool();
  
  // Kiểm tra wallet có tồn tại và chưa có PIN không
  const wallet = await getWalletById(walletId);
  if (!wallet) {
    throw new Error("Wallet không tồn tại");
  }
  
  if (wallet.PinHash) {
    throw new Error("Wallet đã có PIN");
  }
  
  // Update PIN
  const updateResult = await pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("PinHash", sql.NVarChar(255), pinHash)
    .query(`
      UPDATE Wallets
      SET PinHash = @PinHash,
          PinFailedCount = 0,
          PinLockedUntil = NULL,
          UpdatedAt = GETDATE()
      WHERE WalletId = @WalletId
        AND PinHash IS NULL
    `);
  
  // Kiểm tra xem có row nào được update không
  if (updateResult.rowsAffected[0] === 0) {
    // Có thể wallet đã có PIN (race condition)
    const updatedWallet = await getWalletById(walletId);
    if (updatedWallet && updatedWallet.PinHash) {
      throw new Error("Wallet đã có PIN");
    }
    throw new Error("Không thể cập nhật PIN");
  }
  
  // Lấy lại wallet sau khi update
  const updatedWallet = await getWalletById(walletId);
  return updatedWallet;
}

/**
 * Verify PIN và xử lý logic lock
 * @param {string} walletId - Wallet ID
 * @param {string} pin - PIN plain text (6 số)
 * @returns {Object} { isValid: boolean, isLocked: boolean, lockedUntil: Date | null }
 */
async function verifyWalletPin(walletId, pin) {
  const pool = await getPool();
  
  // Lấy thông tin wallet
  const wallet = await getWalletById(walletId);
  if (!wallet) {
    throw new Error("Wallet không tồn tại");
  }
  
  // Kiểm tra wallet có bị lock không
  if (wallet.PinLockedUntil && new Date(wallet.PinLockedUntil) > new Date()) {
    return {
      isValid: false,
      isLocked: true,
      lockedUntil: wallet.PinLockedUntil
    };
  }
  
  // Nếu wallet đã unlock (hết thời gian lock), reset failed count
  if (wallet.PinLockedUntil && new Date(wallet.PinLockedUntil) <= new Date()) {
    await resetPinFailedCount(walletId);
    // Lấy lại wallet sau khi reset
    const updatedWallet = await getWalletById(walletId);
    wallet.PinFailedCount = updatedWallet.PinFailedCount;
    wallet.PinLockedUntil = updatedWallet.PinLockedUntil;
  }
  
  // Verify PIN (so sánh plain text với hash)
  const bcrypt = require("bcryptjs");
  const isValid = wallet.PinHash && await bcrypt.compare(pin, wallet.PinHash);
  
  if (isValid) {
    // Reset failed count khi nhập đúng
    await resetPinFailedCount(walletId);
    return {
      isValid: true,
      isLocked: false,
      lockedUntil: null
    };
  } else {
    // Tăng failed count khi nhập sai
    await incrementPinFailedCount(walletId);
    const updatedWallet = await getWalletById(walletId);
    
    return {
      isValid: false,
      isLocked: updatedWallet.PinLockedUntil && new Date(updatedWallet.PinLockedUntil) > new Date(),
      lockedUntil: updatedWallet.PinLockedUntil
    };
  }
}

/**
 * Tăng PinFailedCount và set PinLockedUntil nếu cần
 * Logic lock:
 * - 5 lần sai → lock 15 phút
 * - 7 lần sai → lock 1 giờ
 * - 10 lần sai → lock 24 giờ
 */
async function incrementPinFailedCount(walletId) {
  const pool = await getPool();
  const wallet = await getWalletById(walletId);
  if (!wallet) {
    throw new Error("Wallet không tồn tại");
  }
  
  const newFailedCount = (wallet.PinFailedCount || 0) + 1;
  let lockUntil = null;
  
  // Logic lock tăng dần
  if (newFailedCount === 5) {
    // Lock 15 phút
    lockUntil = new Date(Date.now() + 15 * 60 * 1000);
  } else if (newFailedCount === 7) {
    // Lock 1 giờ
    lockUntil = new Date(Date.now() + 60 * 60 * 1000);
  } else if (newFailedCount >= 10) {
    // Lock 24 giờ
    lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  
  const result = await pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .input("PinFailedCount", sql.Int, newFailedCount)
    .input("PinLockedUntil", sql.DateTime, lockUntil)
    .query(`
      UPDATE Wallets
      SET PinFailedCount = @PinFailedCount,
          PinLockedUntil = @PinLockedUntil,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Reset PinFailedCount về 0 khi nhập đúng
 */
async function resetPinFailedCount(walletId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("WalletId", sql.UniqueIdentifier, walletId)
    .query(`
      UPDATE Wallets
      SET PinFailedCount = 0,
          PinLockedUntil = NULL,
          UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE WalletId = @WalletId
    `);
  return result.recordset[0] || null;
}

/**
 * Kiểm tra wallet có bị lock không
 */
async function checkWalletLocked(walletId) {
  const wallet = await getWalletById(walletId);
  if (!wallet) {
    return { isLocked: false, lockedUntil: null };
  }
  
  if (wallet.PinLockedUntil && new Date(wallet.PinLockedUntil) > new Date()) {
    return {
      isLocked: true,
      lockedUntil: wallet.PinLockedUntil
    };
  }
  
  // Nếu đã hết thời gian lock, reset failed count
  if (wallet.PinLockedUntil && new Date(wallet.PinLockedUntil) <= new Date()) {
    await resetPinFailedCount(walletId);
  }
  
  return {
    isLocked: false,
    lockedUntil: null
  };
}

/**
 * Unlock wallet (set PinFailedCount = 0, PinLockedUntil = NULL)
 * Chỉ dùng khi hết thời gian lock (tự động)
 */
async function unlockWallet(walletId) {
  return await resetPinFailedCount(walletId);
}

module.exports = {
  createWallet,
  getWalletByEntityAccountId,
  getWalletById,
  updateBalance,
  lockBalance,
  unlockBalance,
  releaseLockedBalance,
  createTransaction,
  getTransactions,
  countTransactions,
  setWalletPin,
  verifyWalletPin,
  incrementPinFailedCount,
  resetPinFailedCount,
  checkWalletLocked,
  unlockWallet
};

