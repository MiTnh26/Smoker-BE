const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả loại bàn theo BarPageId
async function getTableClassificationsByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT TableClassificationId, TableTypeName, Color, BarPageId
      FROM TableClassifications
      WHERE BarPageId = @BarPageId
      ORDER BY TableTypeName
    `);
  return result.recordset;
}

// Lấy loại bàn theo Id
async function getTableClassificationById(tableClassificationId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`
      SELECT TableClassificationId, TableTypeName, Color, BarPageId
      FROM TableClassifications
      WHERE TableClassificationId = @TableClassificationId
    `);
  return result.recordset[0] || null;
}

// Tạo loại bàn mới
async function createTableClassification({ tableTypeName, color, barPageId }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("TableTypeName", sql.NVarChar(50), tableTypeName)
    .input("Color", sql.NVarChar(10), color)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      INSERT INTO TableClassifications (TableTypeName, Color, BarPageId)
      OUTPUT inserted.*
      VALUES (@TableTypeName, @Color, @BarPageId)
    `);
  return result.recordset[0];
}

// Cập nhật loại bàn
async function updateTableClassification(tableClassificationId, updates) {
  const pool = await getPool();
  const { tableTypeName, color } = updates;

  const result = await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .input("TableTypeName", sql.NVarChar(50), tableTypeName || null)
    .input("Color", sql.NVarChar(10), color || null)
    .query(`
      UPDATE TableClassifications
      SET 
        TableTypeName = COALESCE(@TableTypeName, TableTypeName),
        Color = COALESCE(@Color, Color)
      WHERE TableClassificationId = @TableClassificationId;

      SELECT * FROM TableClassifications WHERE TableClassificationId = @TableClassificationId;
    `);
  return result.recordset[0] || null;
}

// Xóa loại bàn
async function deleteTableClassification(tableClassificationId) {
  const pool = await getPool();
  await pool.request()
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`DELETE FROM TableClassifications WHERE TableClassificationId = @TableClassificationId`);
  return true;
}

module.exports = {
  getTableClassificationsByBarPageId,
  getTableClassificationById,
  createTableClassification,
  updateTableClassification,
  deleteTableClassification,
};
