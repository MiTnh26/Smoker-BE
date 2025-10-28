const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả bàn theo BarId kèm thông tin loại bàn
async function getBarTablesByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT 
        bt.BarTableId,
        bt.BarId,
        bt.TableApplyId,
        bt.TableName,
        bt.DepositPrice,
        bt.Status,
        bt.TableClassificationId,
        tc.TableTypeName,
        tc.Color
      FROM BarTables bt
      LEFT JOIN TableClassifications tc
        ON bt.TableClassificationId = tc.TableClassificationId
      WHERE bt.BarId = @BarId
      ORDER BY bt.TableName
    `);
  return result.recordset;
}


// Lấy bàn theo Id
async function getBarTableById(barTableId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarTableId", sql.UniqueIdentifier, barTableId)
    .query(`
      SELECT BarTableId, BarId, TableApplyId, TableName, DepositPrice, Status, TableClassificationId
      FROM BarTables
      WHERE BarTableId = @BarTableId
    `);
  return result.recordset[0] || null;
}

// Tạo bàn mới
async function createBarTable({ barId, tableApplyId = null, tableName, depositPrice = 0, status = "Active", tableClassificationId }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .input("TableName", sql.NVarChar(20), tableName)
    .input("DepositPrice", sql.Int, depositPrice)
    .input("Status", sql.NVarChar(20), status)
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId)
    .query(`
      INSERT INTO BarTables (BarId, TableApplyId, TableName, DepositPrice, Status, TableClassificationId)
      OUTPUT inserted.*
      VALUES (@BarId, @TableApplyId, @TableName, @DepositPrice, @Status, @TableClassificationId)
    `);
  return result.recordset[0];
}

// Cập nhật bàn
async function updateBarTable(barTableId, updates) {
  const pool = await getPool();
  const { tableName, depositPrice, status, tableClassificationId, tableApplyId } = updates;

  const result = await pool.request()
    .input("BarTableId", sql.UniqueIdentifier, barTableId)
    .input("TableName", sql.NVarChar(20), tableName || null)
    .input("DepositPrice", sql.Int, depositPrice || null)
    .input("Status", sql.NVarChar(20), status || null)
    .input("TableClassificationId", sql.UniqueIdentifier, tableClassificationId || null)
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId || null)
    .query(`
      UPDATE BarTables
      SET 
        TableName = COALESCE(@TableName, TableName),
        DepositPrice = COALESCE(@DepositPrice, DepositPrice),
        Status = COALESCE(@Status, Status),
        TableClassificationId = COALESCE(@TableClassificationId, TableClassificationId),
        TableApplyId = COALESCE(@TableApplyId, TableApplyId)
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
