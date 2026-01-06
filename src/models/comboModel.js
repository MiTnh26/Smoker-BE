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
        bp.Address AS BarAddress,
        bp.PhoneNumber AS BarPhone
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      WHERE c.BarId = @BarId
      ORDER BY c.ComboName ASC
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
        bp.PhoneNumber AS BarPhone
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      WHERE c.ComboId = @ComboId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy combos theo khoảng giá
 */
async function getCombosByPriceRange(barId, minPrice, maxPrice) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("MinPrice", sql.Int, minPrice || 0)
    .input("MaxPrice", sql.Int, maxPrice || 999999999)
    .query(`
      SELECT
        c.*,
        bp.BarName,
        bp.Address AS BarAddress,
        bp.PhoneNumber AS BarPhone
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      WHERE c.BarId = @BarId AND c.Price BETWEEN @MinPrice AND @MaxPrice
      ORDER BY c.ComboName ASC
    `);
  return result.recordset;
}

/**
 * Tạo combo mới
 */
async function createCombo({
  comboName,
  barId,
  price = 0,
  description = null
}) {
  const pool = await getPool();
  const comboId = require('crypto').randomUUID(); // Generate new UUID

  const result = await pool.request()
    .input("ComboId", sql.UniqueIdentifier, comboId)
    .input("ComboName", sql.NVarChar(250), comboName)
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("Price", sql.Int, price)
    .input("Description", sql.NVarChar(500), description)
    .query(`
      INSERT INTO Combos (ComboId, ComboName, BarId, Price, Description)
      OUTPUT inserted.*
      VALUES (@ComboId, @ComboName, @BarId, @Price, @Description)
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

  const fields = ['comboName', 'price', 'description'];

  fields.forEach(field => {
    if (updates[field] !== undefined) {
      const sqlField = field.charAt(0).toUpperCase() + field.slice(1);
      const sqlType = field === 'comboName' ? sql.NVarChar(250) :
                     field === 'description' ? sql.NVarChar(500) :
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
 * Lấy combos có sẵn theo BarId (active status)
 */
async function getAvailableCombosByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT
        c.*,
        bp.BarName,
        bp.Address AS BarAddress
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      WHERE c.BarId = @BarId
      ORDER BY c.Price ASC, c.ComboName ASC
    `);
  return result.recordset;
}

/**
 * Tìm combos theo khoảng giá chi tiêu tối thiểu
 */
async function getCombosByMinSpendRange(minAmount = 0, maxAmount = null, barId = null) {
  const pool = await getPool();
  const request = pool.request()
    .input("MinAmount", sql.Int, minAmount);

  let whereClause = "c.Price >= @MinAmount";

  if (maxAmount !== null) {
    request.input("MaxAmount", sql.Int, maxAmount);
    whereClause += " AND c.Price <= @MaxAmount";
  }

  if (barId) {
    request.input("BarId", sql.UniqueIdentifier, barId);
    whereClause += " AND c.BarId = @BarId";
  }

  const result = await request.query(`
    SELECT
      c.*,
      bp.BarName,
      bp.Address AS BarAddress
    FROM Combos c
    LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
    WHERE ${whereClause}
    ORDER BY c.Price ASC, c.ComboName ASC
  `);

  return result.recordset;
}

/**
 * Xóa combo (hard delete)
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

/**
 * Lấy combo phổ biến nhất (có nhiều booking nhất)
 */
async function getPopularCombos(limit = 10) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit)
        c.*,
        bp.BarName,
        bp.Address AS BarAddress,
        COUNT(bs.BookedScheduleId) as BookingCount
      FROM Combos c
      LEFT JOIN BarPages bp ON c.BarId = bp.BarPageId
      LEFT JOIN BookedSchedules bs ON c.ComboId = bs.ComboId
      GROUP BY c.ComboId, c.ComboName, c.BarId, c.Price,
               c.Description,
               bp.BarName, bp.Address
      ORDER BY COUNT(bs.BookedScheduleId) DESC, c.Price ASC
    `);
  return result.recordset;
}

module.exports = {
  getCombosByBarId,
  getComboById,
  createCombo,
  updateCombo,
  getCombosByPriceRange,
  deleteCombo,
  countCombosByBarId,
  getPopularCombos,
  getAvailableCombosByBarId,
  getCombosByMinSpendRange
};
