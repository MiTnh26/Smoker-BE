const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả TableApply
async function getAllTableApplies() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT TableApplyId FROM TableApplies`);
  return result.recordset;
}

// Lấy TableApply theo Id
async function getTableApplyById(tableApplyId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .query(`SELECT TableApplyId FROM TableApplies WHERE TableApplyId = @TableApplyId`);
  return result.recordset[0] || null;
}

// Tạo TableApply mới
async function createTableApply({ name }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Name", sql.NVarChar(100), name)
    .query(`INSERT INTO TableApplies (TableApplyId, Name) OUTPUT inserted.* VALUES (NEWID(), @Name)`);
  return result.recordset[0];
}

// Cập nhật TableApply
async function updateTableApply(tableApplyId, { name }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .input("Name", sql.NVarChar(100), name)
    .query(`
      UPDATE TableApplies
      SET Name = @Name
      WHERE TableApplyId = @TableApplyId
      SELECT * FROM TableApplies WHERE TableApplyId = @TableApplyId
    `);
  return result.recordset[0] || null;
}

// Xóa TableApply
async function deleteTableApply(tableApplyId) {
  const pool = await getPool();
  await pool.request()
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .query(`DELETE FROM TableApplies WHERE TableApplyId = @TableApplyId`);
  return true;
}

module.exports = {
  getAllTableApplies,
  getTableApplyById,
  createTableApply,
  updateTableApply,
  deleteTableApply,
};
