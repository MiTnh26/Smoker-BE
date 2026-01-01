const { getPool, sql } = require("../db/sqlserver");
const bcrypt = require("bcryptjs");

/**
 * Tạo Manager mới
 */
async function createManager({ email, password, role = "Admin", phone = null }) {
  const pool = await getPool();
  
  // Check duplicate email
  const existing = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .query("SELECT TOP 1 ManagerId FROM Managers WHERE Email = @Email");
  
  if (existing.recordset.length > 0) {
    throw new Error("Email đã tồn tại");
  }

  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .input("Password", sql.NVarChar(100), hashed)
    .input("Role", sql.NVarChar(50), role)
    .input("Phone", sql.NVarChar(100), phone)
    .input("Status", sql.NVarChar(50), "active")
    .query(`
      INSERT INTO Managers (ManagerId, Email, Password, Role, Phone, Status, CreatedAt)
      OUTPUT inserted.*
      VALUES (NEWID(), @Email, @Password, @Role, @Phone, @Status, GETDATE())
    `);

  return result.recordset[0];
}

/**
 * Lấy Manager theo Email
 */
async function getManagerByEmail(email) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .query(`
      SELECT ManagerId, Email, Password, Role, Phone, Status, CreatedAt
      FROM Managers
      WHERE Email = @Email
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy Manager theo ManagerId
 */
async function getManagerById(managerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .query(`
      SELECT ManagerId, Email, Role, Phone, Status, CreatedAt
      FROM Managers
      WHERE ManagerId = @ManagerId
    `);
  return result.recordset[0] || null;
}

/**
 * Verify password
 */
async function verifyPassword(manager, password) {
  return await bcrypt.compare(password, manager.Password);
}

/**
 * Kiểm tra Manager có tồn tại không
 */
async function managerExists(email) {
  const manager = await getManagerByEmail(email);
  return manager !== null;
}

module.exports = {
  createManager,
  getManagerByEmail,
  getManagerById,
  verifyPassword,
  managerExists
};

