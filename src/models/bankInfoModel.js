const { getPool, sql } = require("../db/sqlserver");
const { normalizeToEntityAccountId } = require("./entityAccountModel");

// ➕ Tạo BankInfo mới (nhận entityAccountId)
async function createBankInfo({ bankName, accountNumber, accountHolderName, entityAccountId }) {
  const pool = await getPool();
  
  // Validate: phải có entityAccountId
  if (!entityAccountId) {
    throw new Error("Phải có entityAccountId");
  }

  const result = await pool.request()
    .input("BankName", sql.NVarChar(100), bankName)
    .input("AccountNumber", sql.NVarChar(50), accountNumber)
    .input("AccountHolderName", sql.NVarChar(150), accountHolderName)
    .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
    .query(`
      INSERT INTO BankInfo (BankInfoId, BankName, AccountNumber, AccountHolderName, EntityAccountId)
      OUTPUT INSERTED.*
      VALUES (NEWID(), @BankName, @AccountNumber, @AccountHolderName, @EntityAccountId)
    `);
  
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo BankInfoId
async function getBankInfoById(bankInfoId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountHolderName, EntityAccountId
      FROM BankInfo
      WHERE BankInfoId = @BankInfoId
    `);
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo EntityAccountId
async function getBankInfoByEntityAccountId(entityAccountId) {
  const pool = await getPool();
  if (!entityAccountId) {
    console.log("⚠️ getBankInfoByEntityAccountId: entityAccountId is null or undefined");
    return null;
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const entityAccountIdStr = entityAccountId.toString().trim();
  if (!uuidRegex.test(entityAccountIdStr)) {
    console.log("⚠️ getBankInfoByEntityAccountId: Invalid UUID format:", entityAccountIdStr);
    return null;
  }
  
  console.log("🔍 getBankInfoByEntityAccountId - Querying for EntityAccountId:", entityAccountIdStr);
  
  const result = await pool.request()
    .input("EntityAccountId", sql.UniqueIdentifier, entityAccountIdStr)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountHolderName, EntityAccountId
      FROM BankInfo
      WHERE EntityAccountId = @EntityAccountId
    `);
  
  return result.recordset[0] || null;
}

// 📖 Lấy BankInfo theo AccountId
// Query trực tiếp theo AccountId (bảng BankInfo có cột AccountId)
async function getBankInfoByAccountId(accountId) {
  if (!accountId) {
    console.log("⚠️ getBankInfoByAccountId: accountId is null or undefined");
    return null;
  }
  
  const pool = await getPool();
  
  try {
    console.log("🔍 Querying BankInfo by AccountId:", accountId);
    // Query theo AccountId trực tiếp - SELECT tất cả cột để tránh lỗi tên cột
    const result = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT *
        FROM BankInfo
        WHERE AccountId = @AccountId
      `);
    
    console.log("🔍 Query result - Records found:", result.recordset.length);
    
    if (result.recordset.length > 0) {
      const bankInfo = result.recordset[0];
      console.log("✅ Found BankInfo by AccountId:", {
        BankInfoId: bankInfo.BankInfoId,
        BankName: bankInfo.BankName,
        AccountNumber: bankInfo.AccountNumber,
        AccountId: bankInfo.AccountId
      });
      return bankInfo;
    }
    
    console.log("⚠️ No BankInfo found for AccountId:", accountId);
    return null;
  } catch (err) {
    console.error("❌ Error querying BankInfo by AccountId:", err.message);
    console.error("❌ Error stack:", err.stack);
    return null;
  }
}



// ✏️ Cập nhật BankInfo
async function updateBankInfo(bankInfoId, { bankName, accountNumber, accountHolderName }) {
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

  if (accountHolderName !== undefined) {
    updates.push("AccountHolderName = @AccountHolderName");
    request.input("AccountHolderName", sql.NVarChar, accountHolderName);
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
  getBankInfoByEntityAccountId,
  getBankInfoByAccountId, // Backward compatibility
  updateBankInfo,
  deleteBankInfo,
};

