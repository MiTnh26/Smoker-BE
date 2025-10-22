const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy thông tin BarPage theo ID
 */
async function getBarPageById(barPageId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT BarPageId, AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email, created_at
      FROM BarPages
      WHERE BarPageId = @BarPageId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy BarPage theo AccountId (vì mỗi account chỉ có 1 bar page)
 */
async function getBarPageByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT BarPageId, AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email, created_at
      FROM BarPages
      WHERE AccountId = @AccountId
    `);
  return result.recordset[0] || null;
}

/**
 * Tạo mới BarPage
 */
async function createBarPage({
  accountId,
  barName,
  avatar = null,
  background = null,
  address = null,
  phoneNumber = null,
  role = "Bar",
  email = null
}) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("BarName", sql.NVarChar(100), barName)
    .input("Avatar", sql.NVarChar(1000), avatar)
    .input("Background", sql.NVarChar(1000), background)
    .input("Address", sql.NVarChar(255), address)
    .input("PhoneNumber", sql.NVarChar(15), phoneNumber)
    .input("Role", sql.NVarChar(15), role)
    .input("Email", sql.NVarChar(50), email)
    .query(`
      INSERT INTO BarPages (AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email)
      OUTPUT inserted.BarPageId, inserted.AccountId, inserted.BarName, inserted.Role, inserted.Email
      VALUES (@AccountId, @BarName, @Avatar, @Background, @Address, @PhoneNumber, @Role, @Email)
    `);

  return result.recordset[0];
}

/**
 * Cập nhật thông tin BarPage
 */
async function updateBarPage(barPageId, { barName, avatar, background, address, phoneNumber, email }) {
  const pool = await getPool();
  const request = pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("BarName", sql.NVarChar(100), barName || null)
    .input("Avatar", sql.NVarChar(sql.MAX), avatar || null)      // ✅ sửa ở đây
    .input("Background", sql.NVarChar(sql.MAX), background || null) 
    .input("Address", sql.NVarChar(255), address || null)
    .input("PhoneNumber", sql.NVarChar(15), phoneNumber || null)
    .input("Email", sql.NVarChar(50), email || null);

  const result = await request.query(`
    UPDATE BarPages
    SET 
      BarName = COALESCE(@BarName, BarName),
      Avatar = COALESCE(@Avatar, Avatar),
      Background = COALESCE(@Background, Background),
      Address = COALESCE(@Address, Address),
      PhoneNumber = COALESCE(@PhoneNumber, PhoneNumber),
      Email = COALESCE(@Email, Email)
    WHERE BarPageId = @BarPageId;

    SELECT BarPageId, AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email, created_at
    FROM BarPages WHERE BarPageId = @BarPageId;
  `);

  return result.recordset[0] || null;
}

/**
 * Xóa BarPage (nếu cần)
 */
async function deleteBarPage(barPageId) {
  const pool = await getPool();
  await pool
    .request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`DELETE FROM BarPages WHERE BarPageId = @BarPageId`);
  return true;
}

module.exports = {
  getBarPageById, 
  getBarPageByAccountId,
  createBarPage,
  updateBarPage,
  deleteBarPage,
};
