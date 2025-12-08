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
  // Đảm bảo AccountId không null và có giá trị hợp lệ
  if (!accountId) {
    console.log("⚠️ getBankInfoByAccountId: accountId is null or undefined");
    return null;
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const accountIdStr = accountId.toString().trim();
  if (!uuidRegex.test(accountIdStr)) {
    console.log("⚠️ getBankInfoByAccountId: Invalid UUID format:", accountIdStr);
    return null;
  }
  
  console.log("🔍 getBankInfoByAccountId - Querying for AccountId:", accountIdStr);
  
  // Query với điều kiện chặt chẽ: sử dụng CAST để đảm bảo so sánh chính xác
  // SQL Server UniqueIdentifier có thể có vấn đề với case sensitivity trong một số trường hợp
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountIdStr)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE AccountId = @AccountId
        AND AccountId IS NOT NULL
        AND LOWER(CAST(AccountId AS VARCHAR(36))) = LOWER(CAST(@AccountId AS VARCHAR(36)))
    `);
  
  const found = result.recordset[0] || null;
  if (found) {
    // Triple check: đảm bảo AccountId thực sự match và không phải NULL
    const foundAccountId = found.AccountId ? found.AccountId.toString().toLowerCase().trim() : null;
    const searchAccountId = accountIdStr.toLowerCase().trim();
    
    if (!foundAccountId) {
      console.warn("⚠️ getBankInfoByAccountId - Found record with NULL AccountId, returning null");
      return null; // Record có NULL AccountId, không hợp lệ
    }
    
    if (foundAccountId !== searchAccountId) {
      console.warn("⚠️ getBankInfoByAccountId - AccountId mismatch! Found:", foundAccountId, "Searching:", searchAccountId);
      return null; // Return null nếu không match
    }
    console.log("✅ getBankInfoByAccountId - AccountId verified match:", foundAccountId);
  }
  console.log("🔍 getBankInfoByAccountId - Result:", found ? "Found" : "Not found", found ? { BankInfoId: found.BankInfoId, AccountId: found.AccountId } : "");
  return found;
}

// 📖 Lấy BankInfo theo BarPageId
async function getBankInfoByBarPageId(barPageId) {
  const pool = await getPool();
  // Đảm bảo BarPageId không null và có giá trị hợp lệ
  if (!barPageId) {
    console.log("⚠️ getBankInfoByBarPageId: barPageId is null or undefined");
    return null;
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const barPageIdStr = barPageId.toString().trim();
  if (!uuidRegex.test(barPageIdStr)) {
    console.log("⚠️ getBankInfoByBarPageId: Invalid UUID format:", barPageIdStr);
    return null;
  }
  
  console.log("🔍 getBankInfoByBarPageId - Querying for BarPageId:", barPageIdStr);
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageIdStr)
    .query(`
      SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE BarPageId = @BarPageId
        AND BarPageId IS NOT NULL
    `);
  
  const found = result.recordset[0] || null;
  if (found) {
    // Double check: đảm bảo BarPageId thực sự match và không phải NULL
    const foundBarPageId = found.BarPageId ? found.BarPageId.toString().toLowerCase().trim() : null;
    const searchBarPageId = barPageIdStr.toLowerCase().trim();
    
    if (!foundBarPageId) {
      console.warn("⚠️ getBankInfoByBarPageId - Found record with NULL BarPageId, returning null");
      return null; // Record có NULL BarPageId, không hợp lệ
    }
    
    if (foundBarPageId !== searchBarPageId) {
      console.warn("⚠️ getBankInfoByBarPageId - BarPageId mismatch! Found:", foundBarPageId, "Searching:", searchBarPageId);
      return null; // Return null nếu không match
    }
    console.log("✅ getBankInfoByBarPageId - BarPageId verified match:", foundBarPageId);
  }
  console.log("🔍 getBankInfoByBarPageId - Result:", found ? "Found" : "Not found", found ? { BankInfoId: found.BankInfoId, BarPageId: found.BarPageId } : "");
  return found;
}

// 🗑️ Xóa các record có AccountId và BarPageId đều NULL (orphan records)
// Hoặc có AccountId = NULL hoặc BarPageId = NULL (có thể gây unique constraint violation)
async function deleteNullRecords() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      DELETE FROM BankInfo
      WHERE (AccountId IS NULL AND BarPageId IS NULL)
         OR (AccountId IS NULL)
         OR (BarPageId IS NULL)
    `);
  const deletedCount = result.rowsAffected[0] || 0;
  console.log(`🗑️ Deleted ${deletedCount} NULL records from BankInfo`);
  return deletedCount;
}

// 📖 Lấy BankInfo có AccountId và BarPageId đều NULL (orphan records)
async function getBankInfoByNullIds() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      SELECT TOP 1 BankInfoId, BankName, AccountNumber, AccountId, BarPageId
      FROM BankInfo
      WHERE AccountId IS NULL AND BarPageId IS NULL
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
  deleteNullRecords,
  getBankInfoByNullIds,
};

