const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy tất cả vouchers với filter
 */
async function getAllVouchers({ status, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("v.Status = @Status");
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await request.query(`
    SELECT
      v.*
    FROM Vouchers v
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
      SELECT v.*
      FROM Vouchers v
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
      SELECT v.*
      FROM Vouchers v
      WHERE v.VoucherCode = @VoucherCode
    `);
  return result.recordset[0] || null;
}

/**
 * Tạo voucher mới
 */
// Tạo voucher mới
async function createVoucher({
  startDate,
  endDate,
  discountPercentage,
  voucherName,
  voucherCode,
  status = "ACTIVE",
  maxUsage,
  minComboValue
}) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voucherModel.js:69',message:'createVoucher called',data:{voucherName,voucherCode,discountPercentage,maxUsage,minComboValue},sessionId:'debug-session',runId:'run1',hypothesisId:'MODEL',timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    const pool = await getPool();
    const voucherId = require('crypto').randomUUID(); // Generate new UUID

    const result = await pool.request()
      .input("VoucherId", sql.UniqueIdentifier, voucherId)
      .input("StartDate", sql.Date, startDate)
      .input("EndDate", sql.Date, endDate)
      .input("DiscountPercentage", sql.Int, discountPercentage)
      .input("VoucherName", sql.NVarChar(50), voucherName)
      .input("VoucherCode", sql.NVarChar(50), voucherCode)
      .input("Status", sql.NVarChar(50), status)
      .input("MaxUsage", sql.Int, maxUsage)
      .input("MinComboValue", sql.Decimal(18, 2), minComboValue)
      .query(`
        INSERT INTO Vouchers
          (VoucherId, StartDate, EndDate, DiscountPercentage, VoucherName, VoucherCode, Status, MaxUsage, MinComboValue)
        OUTPUT inserted.*
        VALUES (@VoucherId, @StartDate, @EndDate, @DiscountPercentage, @VoucherName, @VoucherCode, @Status, @MaxUsage, @MinComboValue)
      `);

    if (!result.recordset || result.recordset.length === 0) {
      throw new Error('Insert succeeded but no record returned');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voucherModel.js:95',message:'createVoucher success',data:{voucherId:result.recordset[0].VoucherId},sessionId:'debug-session',runId:'run1',hypothesisId:'MODEL',timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return result.recordset[0];
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voucherModel.js:100',message:'createVoucher error',data:{error:error.message},sessionId:'debug-session',runId:'run1',hypothesisId:'MODEL',timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    throw error;
  }
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

      // Define correct SQL types for each field
      let sqlType;
      switch (field) {
        case 'discountPercentage':
        case 'maxUsage':
          sqlType = sql.Int;
          break;
        case 'minComboValue':
          sqlType = sql.Decimal(18, 2);
          break;
        case 'startDate':
        case 'endDate':
          sqlType = sql.Date;
          break;
        default:
          sqlType = sql.NVarChar(50);
      }

      request.input(sqlField, sqlType, updates[field]);
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
 * Tăng số lần sử dụng voucher
 */
async function incrementUsedCount(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`
      UPDATE Vouchers
      SET UsedCount = UsedCount + 1
      OUTPUT inserted.*
      WHERE VoucherId = @VoucherId
    `);
  return result.recordset[0] || null;
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
 * Lấy danh sách voucher active
 */
async function getActiveVouchers() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT * FROM Vouchers
    WHERE Status = 'ACTIVE'
    ORDER BY VoucherCode ASC
  `);
  return result.recordset;
}

/**
 * Đếm tổng số vouchers
 */
async function countVouchers({ status } = {}) {
  const pool = await getPool();
  const request = pool.request();

  let whereConditions = [];

  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("Status = @Status");
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
  countVouchers,
  getActiveVouchers
};
