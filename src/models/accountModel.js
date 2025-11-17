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
    .input("Address", sql.NVarChar(sql.MAX), address || null)
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
    .input("Address", sql.NVarChar(sql.MAX), address || null)
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

// Admin listing with filters and pagination
async function listAccounts({ query = "", role = "", status = "", page = 1, pageSize = 20 }) {
  const pool = await getPool();
  const q = `%${query}%`;
  const offset = (page - 1) * pageSize;

  // Build dynamic WHERE
  let where = "WHERE 1=1";
  if (query) where += " AND (Email LIKE @q OR UserName LIKE @q)";
  if (role) where += " AND Role = @Role";
  if (status) where += " AND Status = @Status";

  const countSql = `SELECT COUNT(1) AS total FROM Accounts ${where}`;
  const dataSql = `SELECT AccountId, Email, UserName, Role, Status, Avatar, created_at
                   FROM Accounts ${where}
                   ORDER BY created_at DESC
                   OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`;

  const request = pool.request()
    .input("q", sql.NVarChar(200), q)
    .input("Role", sql.NVarChar(50), role || null)
    .input("Status", sql.NVarChar(20), status || null)
    .input("offset", sql.Int, offset)
    .input("pageSize", sql.Int, pageSize);

  const [countRs, dataRs] = await Promise.all([
    request.query(countSql),
    request.query(dataSql)
  ]);

  const total = countRs.recordset?.[0]?.total || 0;
  return { total, items: dataRs.recordset };
}

async function updateAccountStatus(accountId, status) {
  const pool = await getPool();
  const rs = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("Status", sql.NVarChar(20), status)
    .query("UPDATE Accounts SET Status = @Status WHERE AccountId = @AccountId; SELECT AccountId, Email, UserName, Role, Status FROM Accounts WHERE AccountId = @AccountId");
  return rs.recordset?.[0] || null;
}

async function updateAccountRole(accountId, role) {
  const pool = await getPool();
  const rs = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("Role", sql.NVarChar(50), role)
    .query("UPDATE Accounts SET Role = @Role WHERE AccountId = @AccountId; SELECT AccountId, Email, UserName, Role, Status FROM Accounts WHERE AccountId = @AccountId");
  return rs.recordset?.[0] || null;
}

module.exports = {
  findAccountByEmail,
  getAccountById,
  createAccount,
  updateLastLogin,
  updateAccountInfo,
  hasProfileComplete,
  updatePassword,
  listAccounts,
  updateAccountStatus,
  updateAccountRole
};