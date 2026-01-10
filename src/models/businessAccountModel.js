
const { getPool,sql } = require("../db/sqlserver");


// Lấy thông tin của business account theo BussinessAccountId
async function getBusinessAccountById(BussinessAccountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
    .query(`
      SELECT 
        BussinessAccountId, AccountId, UserName, Role, 
        Avatar, Background, Phone, Address, Bio, Status, Gender, PricePerHours, PricePerSession, created_at
      FROM BussinessAccounts
      WHERE BussinessAccountId = @BussinessAccountId
    `);
  return result.recordset[0] || null;
}

// Lấy tất cả BusinessAccount của 1 Account
// JOIN với EntityAccounts để lấy EntityAccountId
async function getBusinessAccountsByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT 
        ba.BussinessAccountId, ba.AccountId, ba.UserName, ba.Role, 
        ba.Avatar, ba.Background, ba.Phone, ba.Address, ba.Bio, ba.Status, ba.Gender, 
        ba.PricePerHours, ba.PricePerSession, ba.created_at, ea.EntityAccountId
      FROM BussinessAccounts ba
      LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
      WHERE ba.AccountId = @AccountId
      ORDER BY ba.created_at DESC
    `);
  return result.recordset;
}
// ➕ Tạo BusinessAccount mới
async function createBusinessAccount({
  accountId,
  userName,
  role,
  avatar = null,
  background = null,
  phone = null,
  address = null,
  bio = null,
  gender = null,
  status = "active",
  pricePerHours = 0,
  pricePerSession = 0
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("UserName", sql.NVarChar(100), userName)
    .input("Role", sql.NVarChar(50), role)
    .input("Avatar", sql.NVarChar(1000), avatar)
    .input("Background", sql.NVarChar(1000), background)
    .input("Phone", sql.NVarChar(20), phone)
    .input("Address", sql.NVarChar(sql.MAX), address)
    .input("Bio", sql.NVarChar(500), bio)
    .input("Gender", sql.NVarChar(20), gender)
    .input("Status", sql.NVarChar(20), status)
    .input("PricePerHours", sql.Int, pricePerHours)
    .input("PricePerSession", sql.Int, pricePerSession)
    .query(`
      INSERT INTO BussinessAccounts (
        AccountId, UserName, Role, Avatar, Background, 
        Phone, Address, Bio, Gender, Status, PricePerHours, PricePerSession
      )
      OUTPUT inserted.*
      VALUES (
        @AccountId, @UserName, @Role, @Avatar, @Background,
        @Phone, @Address, @Bio, @Gender, @Status, @PricePerHours, @PricePerSession
      )
    `);
  return result.recordset[0];
}

// ✏️ Cập nhật avatar / background / bio
async function updateBusinessAccountFiles(BussinessAccountId, updates) {
  const pool = await getPool();
  const { userName, avatar, background, bio, phone, address, gender, status, pricePerHours,
    pricePerSession } = updates;

  const result = await pool.request()
    .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
    .input("UserName", sql.NVarChar(100), userName || null)
    .input("Avatar", sql.NVarChar(1000), avatar || null)
    .input("Background", sql.NVarChar(1000), background || null)
    .input("Bio", sql.NVarChar(500), bio || null)
    .input("Phone", sql.NVarChar(20), phone || null)
    .input("Address", sql.NVarChar(sql.MAX), address || null)
    .input("Gender", sql.NVarChar(20), gender || null)
    .input("Status", sql.NVarChar(20), status || null)
    .input("PricePerHours", sql.Int, pricePerHours || null)
    .input("PricePerSession", sql.Int, pricePerSession || null)
    .query(`
      UPDATE BussinessAccounts
      SET 
        UserName = COALESCE(@UserName, UserName),
        Avatar = COALESCE(@Avatar, Avatar),
        Background = COALESCE(@Background, Background),
        Bio = COALESCE(@Bio, Bio),
        Phone = COALESCE(@Phone, Phone),
        Address = COALESCE(@Address, Address),
        Gender = COALESCE(@Gender, Gender),
        Status = COALESCE(@Status, Status),
        PricePerHours = COALESCE(@PricePerHours, PricePerHours),
        PricePerSession = COALESCE(@PricePerSession, PricePerSession)
      WHERE BussinessAccountId = @BussinessAccountId;

      SELECT * FROM BussinessAccounts WHERE BussinessAccountId = @BussinessAccountId;
    `);
  return result.recordset[0] || null;
}

async function updateBusinessStatus(id, status){
  const pool = await getPool();
  const rs = await pool.request()
    .input("id", sql.UniqueIdentifier, id)
    .input("Status", sql.NVarChar(20), status)
    .query(`
      UPDATE BussinessAccounts SET Status=@Status WHERE BussinessAccountId=@id;
      SELECT BussinessAccountId, UserName, Role, Status FROM BussinessAccounts WHERE BussinessAccountId=@id;
    `);
  return rs.recordset?.[0] || null;
}

module.exports = {
  getBusinessAccountById,
  getBusinessAccountsByAccountId,
  createBusinessAccount,
  updateBusinessAccountFiles,
  updateBusinessStatus
};