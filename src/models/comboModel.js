const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy tất cả combos theo BarId với thông tin chi tiết
 */
async function getCombosByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT
        c.*,
        bp.BarName,
        tc.TableTypeName AS TableType,
        tc.Color AS TableColor
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      LEFT JOIN TableClassifications tc ON c.TableApplyId = tc.TableClassificationId
      WHERE c.BarId = @BarId
      ORDER BY c.ComboName
    `);
  return result.recordset;
}

/**
 * Lấy combo theo Id với thông tin chi tiết
 */
async function getComboById(comboId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .query(`
      SELECT
        c.*,
        bp.BarName,
        bp.Address AS BarAddress,
        bp.PhoneNumber AS BarPhone,
        tc.TableTypeName AS TableType,
        tc.Color AS TableColor
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      LEFT JOIN TableClassifications tc ON c.TableApplyId = tc.TableClassificationId
      WHERE c.ComboId = @ComboId
    `);
  return result.recordset[0] || null;
}

/**
 * Tạo combo mới
 */
async function createCombo({
  comboName,
  barId,
  tableApplyId = null,
  price = 0,
  description = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ComboName", sql.NVarChar(250), comboName)
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("TableApplyId", sql.UniqueIdentifier, tableApplyId)
    .input("Price", sql.Int, price)
    .input("Description", sql.NVarChar(500), description)
    .query(`
      INSERT INTO Combos (ComboName, BarId, TableApplyId, Price, Description)
      OUTPUT inserted.*
      VALUES (@ComboName, @BarId, @TableApplyId, @Price, @Description)
    `);
  return result.recordset[0];
}

/**
 * Cập nhật combo
 */
async function updateCombo(comboId, updates) {
  const pool = await getPool();
  const request = pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId);

  let updateFields = [];
  let params = [];

  const fields = ['comboName', 'tableApplyId', 'price', 'description'];

  fields.forEach(field => {
    if (updates[field] !== undefined) {
      const sqlField = field.charAt(0).toUpperCase() + field.slice(1);
      const sqlType = field === 'comboName' ? sql.NVarChar(250) :
                     field === 'description' ? sql.NVarChar(500) :
                     field === 'tableApplyId' ? sql.UniqueIdentifier :
                     sql.Int;
      request.input(sqlField, sqlType, updates[field]);
      updateFields.push(`${sqlField} = @${sqlField}`);
    }
  });

  if (updateFields.length === 0) {
    return await getComboById(comboId);
  }

  await request.query(`
    UPDATE Combos
    SET ${updateFields.join(", ")}
    WHERE ComboId = @ComboId
  `);

  return await getComboById(comboId);
}

/**
 * Lấy combos có sẵn theo BarId (không có VoucherApplyId)
 */
async function getAvailableCombosByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT
        c.*,
        bp.BarName,
        tc.TableTypeName AS TableType,
        tc.Color AS TableColor
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      LEFT JOIN TableClassifications tc ON c.TableApplyId = tc.TableClassificationId
      WHERE c.BarId = @BarId AND c.VoucherApplyId IS NULL
      ORDER BY c.Price ASC, c.ComboName ASC
    `);
  return result.recordset;
}

/**
 * Tìm combos theo khoảng giá
 */
async function getCombosByPriceRange(minPrice = 0, maxPrice = null, barId = null) {
  const pool = await getPool();
  const request = pool.request()
    .input("MinPrice", sql.Int, minPrice);

  let whereClause = "c.Price >= @MinPrice";

  if (maxPrice !== null) {
    request.input("MaxPrice", sql.Int, maxPrice);
    whereClause += " AND c.Price <= @MaxPrice";
  }

  if (barId) {
    request.input("BarId", sql.UniqueIdentifier, barId);
    whereClause += " AND c.BarId = @BarId";
  }

  const result = await request.query(`
    SELECT
      c.*,
      bp.BarName,
      tc.TableTypeName AS TableType
    FROM Combos c
    LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
    LEFT JOIN TableClassifications tc ON c.TableApplyId = tc.TableClassificationId
    WHERE ${whereClause}
    ORDER BY c.Price ASC, c.ComboName ASC
  `);

  return result.recordset;
}

/**
 * Xóa combo
 */
async function deleteCombo(comboId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .query("DELETE FROM Combos OUTPUT deleted.* WHERE ComboId = @ComboId");
  return result.recordset[0] || null;
}

/**
 * Đếm combos theo BarId
 */
async function countCombosByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query("SELECT COUNT(*) as total FROM Combos WHERE BarId = @BarId");
  return result.recordset[0]?.total || 0;
}

module.exports = {
  getCombosByBarId,
  getComboById,
  createCombo,
  updateCombo,
  getAvailableCombosByBarId,
  getCombosByPriceRange,
  deleteCombo,
  countCombosByBarId
};
