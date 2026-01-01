const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả bàn theo BarId kèm thông tin loại bàn
async function getBarTablesByBarId(barId) {
  try {
    const pool = await getPool();
    
    // Validate barId format (GUID)
    if (!barId || typeof barId !== 'string') {
      throw new Error('Invalid barId format');
    }
    
    const result = await pool.request()
      .input("BarId", sql.UniqueIdentifier, barId)
      .query(`
        SELECT 
          bt.BarTableId,
          bt.BarId,
          bt.TableName,
          bt.Status,
          bt.TableClassificationId,
          COALESCE(tc.TableTypeName, '') AS TableTypeName,
          COALESCE(tc.Color, '#eeeeee') AS Color
        FROM BarTables bt
        LEFT JOIN TableClassifications tc
          ON bt.TableClassificationId = tc.TableClassificationId
        WHERE bt.BarId = @BarId
        ORDER BY bt.TableName
      `);
    return result.recordset || [];
  } catch (error) {
    console.error('Error in getBarTablesByBarId:', error);
    throw error;
  }
}


// Lấy bàn theo Id
async function getBarTableById(barTableId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarTableId", sql.UniqueIdentifier, barTableId)
    .query(`
      SELECT BarTableId, BarId, TableName, Status, TableClassificationId
      FROM BarTables
      WHERE BarTableId = @BarTableId
    `);
  return result.recordset[0] || null;
}

// Tạo bàn mới
async function createBarTable({ barId, tableName, status = "Active", tableClassificationId }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("TableName", sql.NVarChar(20), tableName)
    .input("Status", sql.NVarChar(20), status)
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`
      INSERT INTO BarTables (BarId, TableName, Status, TableClassificationId)
      OUTPUT inserted.*
      VALUES (@BarId, @TableName, @Status, @TableClassificationId)
    `);
  return result.recordset[0];
}

// Cập nhật bàn
async function updateBarTable(barTableId, updates) {
  const pool = await getPool();
  const { tableName, status, tableClassificationId } = updates;

  const result = await pool.request()
    .input("BarTableId", sql.UniqueIdentifier, barTableId)
    .input("TableName", sql.NVarChar(20), tableName || null)
    .input("Status", sql.NVarChar(20), status || null)
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId || null)
    .query(`
      UPDATE BarTables
      SET 
        TableName = COALESCE(@TableName, TableName),
        Status = COALESCE(@Status, Status),
        TableClassificationId = COALESCE(@TableClassificationId, TableClassificationId)
      WHERE BarTableId = @BarTableId;

      SELECT * FROM BarTables WHERE BarTableId = @BarTableId;
    `);
  return result.recordset[0] || null;
}

// Xóa bàn
async function deleteBarTable(barTableId) {
  const pool = await getPool();
  await pool.request()
    .input("BarTableId", sql.UniqueIdentifier, barTableId)
    .query(`DELETE FROM BarTables WHERE BarTableId = @BarTableId`);
  return true;
}

module.exports = {
  getBarTablesByBarId,
  getBarTableById,
  createBarTable,
  updateBarTable,
  deleteBarTable,
};
