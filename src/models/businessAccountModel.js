
const { getPool,sql } = require("../db/sqlserver");


// Lấy thông tin của business account theo BussinessAccountId
async function getBusinessAccountById(BussinessAccountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
    .query(`
      SELECT 
        BussinessAccountId, AccountId, BankInfoId, UserName, Role, 
        Avatar, Background, Phone, Address, Bio, Status, Gender, created_at
      FROM BussinessAccounts
      WHERE BussinessAccountId = @BussinessAccountId
    `);
  return result.recordset[0] || null;
}

// Lấy tất cả BusinessAccount của 1 Account
async function getBusinessAccountsByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT 
        BussinessAccountId, AccountId, BankInfoId, UserName, Role, 
        Avatar, Background, Phone, Address, Bio, Status, Gender, created_at
      FROM BussinessAccounts
      WHERE AccountId = @AccountId
      ORDER BY created_at DESC
    `);
  return result.recordset;
}
// ➕ Tạo BusinessAccount mới
async function createBusinessAccount({
  accountId,
  bankInfoId = null,
  userName,
  role,
  avatar = null,
  background = null,
  phone = null,
  address = null,
  bio = null,
  gender = null,
  status = "active"
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .input("UserName", sql.NVarChar(100), userName)
    .input("Role", sql.NVarChar(50), role)
    .input("Avatar", sql.NVarChar(255), avatar)
    .input("Background", sql.NVarChar(255), background)
    .input("Phone", sql.NVarChar(20), phone)
    .input("Address", sql.NVarChar(255), address)
    .input("Bio", sql.NVarChar(500), bio)
    .input("Gender", sql.NVarChar(20), gender)
    .input("Status", sql.NVarChar(20), status)
    .query(`
      INSERT INTO BussinessAccounts (
        AccountId, BankInfoId, UserName, Role, Avatar, Background, 
        Phone, Address, Bio, Gender, Status
      )
      OUTPUT inserted.*
      VALUES (
        @AccountId, @BankInfoId, @UserName, @Role, @Avatar, @Background,
        @Phone, @Address, @Bio, @Gender, @Status
      )
    `);
  return result.recordset[0];
}

// ✏️ Cập nhật avatar / background / bio
async function updateBusinessAccountFiles(BussinessAccountId, updates) {
  const pool = await getPool();
  const { avatar, background, bio, phone, address, gender, status } = updates;

  const result = await pool.request()
    .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
    .input("Avatar", sql.NVarChar(255), avatar || null)
    .input("Background", sql.NVarChar(255), background || null)
    .input("Bio", sql.NVarChar(500), bio || null)
    .input("Phone", sql.NVarChar(20), phone || null)
    .input("Address", sql.NVarChar(255), address || null)
    .input("Gender", sql.NVarChar(20), gender || null)
    .input("Status", sql.NVarChar(20), status || null)
    .query(`
      UPDATE BussinessAccounts
      SET 
        Avatar = COALESCE(@Avatar, Avatar),
        Background = COALESCE(@Background, Background),
        Bio = COALESCE(@Bio, Bio),
        Phone = COALESCE(@Phone, Phone),
        Address = COALESCE(@Address, Address),
        Gender = COALESCE(@Gender, Gender),
        Status = COALESCE(@Status, Status)
      WHERE BussinessAccountId = @BussinessAccountId;

      SELECT * FROM BussinessAccounts WHERE BussinessAccountId = @BussinessAccountId;
    `);
  return result.recordset[0] || null;
}

module.exports = {
  getBusinessAccountById,
  getBusinessAccountsByAccountId,
  createBusinessAccount,
  updateBusinessAccountFiles
};