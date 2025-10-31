const { getPool, sql } = require("../db/sqlserver");

async function findAccountByEmail(email) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(100), email)
    .query(
      `SELECT TOP 1 
      AccountId, Email, Password, Role, UserName, Avatar, Background,
        Phone, Address, Bio, Gender, Status, LastLogin, created_at
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
      ` SELECT TOP 1 
        AccountId, Email, Role, UserName, Avatar, Background, 
        Phone, Address, Bio, Gender, Status, LastLogin, created_at
      FROM Accounts
      WHERE AccountId = @AccountId`
    );
  return result.recordset[0] || null;
}

//  Tạo tài khoản mới
async function createAccount({
  email,
  hashedPassword,
  userName,
  role = "Customer",
  phone = null,
  address = null,
  bio = null,
  gender = null,
  avatar = null,
  background = null,
  status = "active"
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .input("Password", sql.NVarChar(100), hashedPassword)
    .input("Role", sql.NVarChar(50), role)
    .input("UserName", sql.NVarChar(100), userName || null)
    .input("Phone", sql.NVarChar(20), phone || null)
    .input("Address", sql.NVarChar(255), address || null)
    .input("Bio", sql.NVarChar(500), bio || null)
    .input("Gender", sql.NVarChar(20), gender || null)
    .input("Avatar", sql.NVarChar(255), avatar || null)
    .input("Background", sql.NVarChar(255), background || null)
    .input("Status", sql.NVarChar(20), status)
    .query(`
      INSERT INTO Accounts (
        Email, Password, Role, UserName, Phone, Address, Bio,
        Gender, Avatar, Background, Status
      )
      OUTPUT inserted.*
      VALUES (
        @Email, @Password, @Role, @UserName, @Phone, @Address, @Bio,
        @Gender, @Avatar, @Background, @Status
      )
    `);
  return result.recordset[0];
}

// 🕒 Cập nhật lần đăng nhập gần nhất
async function updateLastLogin(accountId) {
  const pool = await getPool();
  await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`UPDATE Accounts SET LastLogin = GETDATE() WHERE AccountId = @AccountId`);
}


// ✏️ Cập nhật thông tin người dùng
async function updateAccountInfo(accountId, updates) {
  const pool = await getPool();
  const {
    userName, avatar, background, bio, address,
    phone, gender, status
  } = updates;

  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("UserName", sql.NVarChar(100), userName || null)
    .input("Avatar", sql.NVarChar(255), avatar || null)
    .input("Background", sql.NVarChar(255), background || null)
    .input("Bio", sql.NVarChar(500), bio || null)
    .input("Address", sql.NVarChar(255), address || null)
    .input("Phone", sql.NVarChar(20), phone || null)
    .input("Gender", sql.NVarChar(20), gender || null)
    .input("Status", sql.NVarChar(20), status || null)
    .query(`
      UPDATE Accounts
      SET 
        UserName = COALESCE(@UserName, UserName),
        Avatar = COALESCE(@Avatar, Avatar),
        Background = COALESCE(@Background, Background),
        Bio = COALESCE(@Bio, Bio),
        Address = COALESCE(@Address, Address),
        Phone = COALESCE(@Phone, Phone),
        Gender = COALESCE(@Gender, Gender),
        Status = COALESCE(@Status, Status)
      WHERE AccountId = @AccountId;

      SELECT * FROM Accounts WHERE AccountId = @AccountId;
    `);

  return result.recordset[0] || null;
}

function hasProfileComplete(account) {
  if (!account) return false;
  const requiredFields = ["UserName", "Avatar", "Phone", "Gender"]; // minimal required fields
  return requiredFields.every((key) => account[key] && String(account[key]).trim() !== "");
}
// Cập nhật mật khẩu tài khoản
async function updatePassword(accountId, hashedPassword) {
  const pool = await getPool();
  await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("Password", sql.NVarChar(100), hashedPassword)
    .query(`UPDATE Accounts SET Password = @Password WHERE AccountId = @AccountId`);
}

module.exports = {
  findAccountByEmail,
  getAccountById,
  createAccount,
  updateLastLogin,
  updateAccountInfo,
  hasProfileComplete,
  updatePassword
};