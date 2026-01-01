const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo manager mới
 */
async function createManager({ email, hashedPassword, role = "admin", phone = null, status = "active" }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .input("Password", sql.NVarChar(100), hashedPassword)
    .input("Role", sql.NVarChar(50), role)
    .input("Phone", sql.NVarChar(100), phone)
    .input("Status", sql.NVarChar(50), status)
    .query(`
      INSERT INTO Managers
        (ManagerId, Email, Password, Role, Phone, Status, CreatedAt)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @Email, @Password, @Role, @Phone, @Status, GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Tìm manager theo email
 */
async function findByEmail(email) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .query("SELECT TOP 1 * FROM Managers WHERE Email = @Email");
  return result.recordset[0] || null;
}

/**
 * Tìm manager theo ID
 */
async function findById(managerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .query("SELECT TOP 1 * FROM Managers WHERE ManagerId = @ManagerId");
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả managers với filter
 */
async function getAllManagers({ status, role, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("Status = @Status");
  }

  if (role) {
    request.input("Role", sql.NVarChar(50), role);
    whereConditions.push("Role = @Role");
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await request.query(`
    SELECT *
    FROM Managers
    ${whereClause}
    ORDER BY CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);

  return result.recordset;
}

/**
 * Cập nhật manager
 */
async function updateManager(managerId, updates) {
  const pool = await getPool();
  const { email, phone, status, role } = updates;

  const request = pool.request()
    .input("ManagerId", sql.UniqueIdentifier, managerId);

  let updateFields = [];
  let params = [];

  if (email !== undefined) {
    request.input("Email", sql.NVarChar(100), email);
    updateFields.push("Email = @Email");
  }

  if (phone !== undefined) {
    request.input("Phone", sql.NVarChar(100), phone);
    updateFields.push("Phone = @Phone");
  }

  if (status !== undefined) {
    request.input("Status", sql.NVarChar(50), status);
    updateFields.push("Status = @Status");
  }

  if (role !== undefined) {
    request.input("Role", sql.NVarChar(50), role);
    updateFields.push("Role = @Role");
  }

  if (updateFields.length === 0) {
    return await findById(managerId);
  }

  await request.query(`
    UPDATE Managers
    SET ${updateFields.join(", ")}
    WHERE ManagerId = @ManagerId
  `);

  return await findById(managerId);
}

/**
 * Cập nhật mật khẩu
 */
async function updatePassword(managerId, hashedPassword) {
  const pool = await getPool();
  await pool.request()
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .input("Password", sql.NVarChar(100), hashedPassword)
    .query("UPDATE Managers SET Password = @Password WHERE ManagerId = @ManagerId");
}

/**
 * Xóa manager
 */
async function deleteManager(managerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .query("DELETE FROM Managers OUTPUT deleted.* WHERE ManagerId = @ManagerId");
  return result.recordset[0] || null;
}

/**
 * Đếm tổng số managers
 */
async function countManagers({ status, role } = {}) {
  const pool = await getPool();
  const request = pool.request();

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("Status = @Status");
  }

  if (role) {
    request.input("Role", sql.NVarChar(50), role);
    whereConditions.push("Role = @Role");
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await request.query(`
    SELECT COUNT(*) as total
    FROM Managers
    ${whereClause}
  `);

  return result.recordset[0]?.total || 0;
}

module.exports = {
  createManager,
  findByEmail,
  findById,
  getAllManagers,
  updateManager,
  updatePassword,
  deleteManager,
  countManagers
};

