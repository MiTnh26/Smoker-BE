const { getPool, sql } = require("../db/sqlserver");

async function findAccountByEmail(email) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(100), email)
    .query(
      `SELECT TOP 1 AccountId, Email, Password, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
       FROM Accounts
       WHERE Email = @email`
    );
  return result.recordset[0] || null;
}

async function getAccountById(accountId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("accountId", sql.UniqueIdentifier, accountId)
    .query(
      `SELECT TOP 1 AccountId, Email, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
       FROM Accounts WHERE AccountId = @accountId`
    );
  return result.recordset[0] || null;
}

async function createAccount({ email, hashedPassword, role = "user", status = "active", userName = null }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(100), email)
    .input("password", sql.NVarChar(100), hashedPassword)
    .input("role", sql.NVarChar(50), role)
    .input("status", sql.NVarChar(20), status)
    .input("userName", sql.NVarChar(100), userName)
    .query(
      `INSERT INTO Accounts (Email, Password, Role, Status, UserName)
       OUTPUT inserted.AccountId, inserted.Email, inserted.Role, inserted.Status
       VALUES (@email, @password, @role, @status, @userName)`
    );
  return result.recordset[0];
}

async function updateLastLogin(accountId) {
  const pool = await getPool();
  await pool
    .request()
    .input("accountId", sql.UniqueIdentifier, accountId)
    .query(`UPDATE Accounts SET LastLogin = GETUTCDATE() WHERE AccountId = @accountId`);
}

async function updateAccountInfo(accountId, { userName, avatar, background, bio, address, phone }) {
  const pool = await getPool();
  const request = pool.request().input("accountId", sql.UniqueIdentifier, accountId);
  request.input("userName", sql.NVarChar(100), userName || null);
  request.input("avatar", sql.NVarChar(1000), avatar || null);
  request.input("background", sql.NVarChar(1000), background || null);
  request.input("bio", sql.NVarChar(500), bio || null);
  request.input("address", sql.NVarChar(255), address || null);
  request.input("phone", sql.NVarChar(20), phone || null);
  const result = await request.query(
    `UPDATE Accounts
     SET UserName = @userName,
         Avatar = @avatar,
         Background = @background,
         Bio = @bio,
         Address = @address,
         Phone = @phone
     WHERE AccountId = @accountId;
     SELECT TOP 1 AccountId, Email, Role, UserName, Avatar, Background, Phone, Address, Bio, Status, LastLogin
     FROM Accounts WHERE AccountId = @accountId;`
  );
  return result.recordset[0] || null;
}

function hasProfileComplete(account) {
  if (!account) return false;
  const requiredFields = ["UserName", "Avatar"]; // minimal required fields
  return requiredFields.every((key) => account[key] && String(account[key]).trim() !== "");
}

module.exports = {
  findAccountByEmail,
  getAccountById,
  createAccount,
  updateLastLogin,
  updateAccountInfo,
  hasProfileComplete,
};
