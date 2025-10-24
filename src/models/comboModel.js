const { getPool, sql } = require("../db/sqlserver");

// 🔹 Lấy tất cả combo theo BarId
async function getCombosByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT 
        c.ComboId,
        c.ComboName,
        c.BarId,
        c.TableApplyId,
        c.VoucherApplyId,
        c.Price
      FROM Combos c
      WHERE c.BarId = @BarId
      ORDER BY c.ComboName
    `);
  return result.recordset;
}

// 🔹 Lấy combo theo Id
async function getComboById(comboId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .query(`
      SELECT 
        ComboId, 
        ComboName, 
        BarId, 
        TableApplyId, 
        VoucherApplyId,
        Price
      FROM Combos
      WHERE ComboId = @ComboId
    `);
  return result.recordset[0] || null;
}

// 🔹 Tạo combo mới
async function createCombo({ comboName, barId, price = 0, tableApplyId = null, voucherApplyId = null }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ComboName", sql.NVarChar(250), comboName)
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("Price", sql.Int, price)
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId)
    .query(`
      INSERT INTO Combos (ComboName, BarId, TableApplyId, VoucherApplyId, Price)
      OUTPUT inserted.*
      VALUES (@ComboName, @BarId, @TableApplyId, @VoucherApplyId, @Price)
    `);
  return result.recordset[0];
}

// 🔹 Cập nhật combo
async function updateCombo(comboId, updates) {
  const pool = await getPool();
  const { comboName, tableApplyId, voucherApplyId, price } = updates;

  const result = await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .input("ComboName", sql.NVarChar(250), comboName || null)
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId || null)
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId || null)
    .input("Price", sql.Int, price ?? null)
    .query(`
      UPDATE Combos
      SET
        ComboName = COALESCE(@ComboName, ComboName),
        TableApplyId = COALESCE(@TableApplyId, TableApplyId),
        VoucherApplyId = COALESCE(@VoucherApplyId, VoucherApplyId),
        Price = COALESCE(@Price, Price)
      WHERE ComboId = @ComboId;

      SELECT * FROM Combos WHERE ComboId = @ComboId;
    `);
  return result.recordset[0] || null;
}

// 🔹 Xóa combo
async function deleteCombo(comboId) {
  const pool = await getPool();
  await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .query(`DELETE FROM Combos WHERE ComboId = @ComboId`);
  return true;
}

module.exports = {
  getCombosByBarId,
  getComboById,
  createCombo,
  updateCombo,
  deleteCombo,
};
