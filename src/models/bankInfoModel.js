const { getPool, sql } = require("../db/sqlserver");

// ➕ Tạo BankInfo mới
async function createBankInfo({ bankName, accountNumber, accountId = null, barPageId = null }) {
  const pool = await getPool();
  
  // Validate: phải có accountId hoặc barPageId
  if (!accountId && !barPageId) {
    throw new Error("Phải có accountId hoặc barPageId");
  }
  
  // Validate: không được có cả hai
  if (accountId && barPageId) {
    throw new Error("Chỉ được có accountId hoặc barPageId, không được có cả hai");
  }

  const result = await pool.request()
    .input("BankName", sql.NVarChar(100), bankName)
    .input("AccountNumber", sql.NVarChar(50), accountNumber)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      INSERT INTO BankInfo (BankInfoId, BankName, AccountNumber, AccountId, BarPageId)
      OUTPUT INSERTED.*
      VALUES (NEWID(), @BankName, @AccountNumber, @AccountId, @BarPageId)
    `);
  
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo BankInfoId
async function getBankInfoById(bankInfoId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE BankInfoId = @BankInfoId
    `);
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo AccountId
async function getBankInfoByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE AccountId = @AccountId
    `);
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo BarPageId
async function getBankInfoByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE BarPageId = @BarPageId
    `);
  return result.recordset[0] || null;
}

// ✏️ Cập nhật BankInfo
async function updateBankInfo(bankInfoId, { bankName, accountNumber }) {
  const pool = await getPool();
  
  const updates = [];
  const request = pool.request()
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId);

  if (bankName !== undefined) {
    updates.push("BankName = @BankName");
    request.input("BankName", sql.NVarChar, bankName);
  }

  if (accountNumber !== undefined) {
    updates.push("AccountNumber = @AccountNumber");
    request.input("AccountNumber", sql.NVarChar, accountNumber);
  }

  if (updates.length === 0) {
    throw new Error("Không có trường nào để cập nhật");
  }

  const result = await request.query(`
    UPDATE BankInfo
    SET ${updates.join(", ")}
    OUTPUT INSERTED.*
    WHERE BankInfoId = @BankInfoId
  `);

  return result.recordset[0] || null;
}

// 🗑️ Xóa BankInfo
async function deleteBankInfo(bankInfoId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .query(`
      DELETE FROM BankInfo
      WHERE BankInfoId = @BankInfoId
    `);
  return result.rowsAffected[0] > 0;
}

module.exports = {
  createBankInfo,
  getBankInfoById,
  getBankInfoByAccountId,
  getBankInfoByBarPageId,
  updateBankInfo,
  deleteBankInfo,
};

