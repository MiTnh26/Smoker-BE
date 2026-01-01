const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy tất cả vouchers với filter
 */
async function getAllVouchers({ status, createdBy, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("v.Status = @Status");
  }

  if (createdBy) {
    request.input("CreatedBy", sql.UniqueIdentifier, createdBy);
    whereConditions.push("v.CreatedBy = @CreatedBy");
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await request.query(`
    SELECT
      v.*,
      m.Email AS CreatorEmail,
      m.UserName AS CreatorUserName
    FROM Vouchers v
    LEFT JOIN Managers m ON v.CreatedBy = m.ManagerId
    ${whereClause}
    ORDER BY v.CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);

  return result.recordset;
}

/**
 * Lấy voucher theo ID
 */
async function getVoucherById(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`
      SELECT
        v.*,
        m.Email AS CreatorEmail,
        m.UserName AS CreatorUserName
      FROM Vouchers v
      LEFT JOIN Managers m ON v.CreatedBy = m.ManagerId
      WHERE v.VoucherId = @VoucherId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy voucher theo VoucherCode
 */
async function getVoucherByCode(voucherCode) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherCode", sql.NVarChar(50), voucherCode)
    .query(`
      SELECT
        v.*,
        m.Email AS CreatorEmail,
        m.UserName AS CreatorUserName
      FROM Vouchers v
      LEFT JOIN Managers m ON v.CreatedBy = m.ManagerId
      WHERE v.VoucherCode = @VoucherCode
    `);
  return result.recordset[0] || null;
}

/**
 * Tạo voucher mới
 */
async function createVoucher({
  startDate,
  endDate,
  discountPercentage,
  voucherName,
  voucherCode,
  status = "ACTIVE",
  maxUsage,
  minComboValue,
  createdBy
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("StartDate", sql.Date, startDate)
    .input("EndDate", sql.Date, endDate)
    .input("DiscountPercentage", sql.Int, discountPercentage)
    .input("VoucherName", sql.NVarChar(50), voucherName)
    .input("VoucherCode", sql.NVarChar(50), voucherCode)
    .input("Status", sql.NVarChar(50), status)
    .input("MaxUsage", sql.Int, maxUsage)
    .input("MinComboValue", sql.Decimal(18, 2), minComboValue)
    .input("CreatedBy", sql.UniqueIdentifier, createdBy)
    .query(`
      INSERT INTO Vouchers
        (StartDate, EndDate, DiscountPercentage, VoucherName, VoucherCode, Status, MaxUsage, MinComboValue, CreatedBy)
      OUTPUT inserted.*
      VALUES (@StartDate, @EndDate, @DiscountPercentage, @VoucherName, @VoucherCode, @Status, @MaxUsage, @MinComboValue, @CreatedBy)
    `);
  return result.recordset[0];
}

/**
 * Cập nhật voucher
 */
async function updateVoucher(voucherId, updates) {
  const pool = await getPool();
  const request = pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId);

  let updateFields = [];
  let params = [];

  const fields = [
    'startDate', 'endDate', 'discountPercentage', 'voucherName',
    'voucherCode', 'status', 'maxUsage', 'minComboValue'
  ];

  fields.forEach(field => {
    if (updates[field] !== undefined) {
      const sqlField = field.charAt(0).toUpperCase() + field.slice(1);
      request.input(sqlField, sql.NVarChar(50), updates[field]);
      updateFields.push(`${sqlField} = @${sqlField}`);
    }
  });

  if (updateFields.length === 0) {
    return await getVoucherById(voucherId);
  }

  await request.query(`
    UPDATE Vouchers
    SET ${updateFields.join(", ")}
    WHERE VoucherId = @VoucherId
  `);

  return await getVoucherById(voucherId);
}

/**
 * Cập nhật UsedCount
 */
async function incrementUsedCount(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`
      UPDATE Vouchers
      SET UsedCount = UsedCount + 1
      OUTPUT inserted.*
      WHERE VoucherId = @VoucherId AND UsedCount < MaxUsage
    `);
  return result.recordset[0] || null;
}

/**
 * Kiểm tra voucher có hợp lệ không
 */
async function validateVoucher(voucherCode, comboValue) {
  const voucher = await getVoucherByCode(voucherCode);
  if (!voucher) return { valid: false, reason: "Voucher không tồn tại" };

  const now = new Date();
  const startDate = new Date(voucher.StartDate);
  const endDate = new Date(voucher.EndDate);

  if (now < startDate) return { valid: false, reason: "Voucher chưa bắt đầu" };
  if (now > endDate) return { valid: false, reason: "Voucher đã hết hạn" };
  if (voucher.Status !== "ACTIVE") return { valid: false, reason: "Voucher không hoạt động" };
  if (voucher.UsedCount >= voucher.MaxUsage) return { valid: false, reason: "Voucher đã hết lượt sử dụng" };
  if (comboValue < voucher.MinComboValue) return { valid: false, reason: `Giá trị combo tối thiểu: ${voucher.MinComboValue}` };

  return { valid: true, voucher };
}

/**
 * Xóa voucher
 */
async function deleteVoucher(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query("DELETE FROM Vouchers OUTPUT deleted.* WHERE VoucherId = @VoucherId");
  return result.recordset[0] || null;
}

/**
 * Đếm tổng số vouchers
 */
async function countVouchers({ status, createdBy } = {}) {
  const pool = await getPool();
  const request = pool.request();

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("Status = @Status");
  }

  if (createdBy) {
    request.input("CreatedBy", sql.UniqueIdentifier, createdBy);
    whereConditions.push("CreatedBy = @CreatedBy");
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await request.query(`
    SELECT COUNT(*) as total
    FROM Vouchers
    ${whereClause}
  `);

  return result.recordset[0]?.total || 0;
}

module.exports = {
  getAllVouchers,
  getVoucherById,
  getVoucherByCode,
  createVoucher,
  updateVoucher,
  incrementUsedCount,
  validateVoucher,
  deleteVoucher,
  countVouchers
};
