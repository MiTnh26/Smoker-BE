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
 * Tạo voucher mới (Admin tạo - standard)
 */
async function createVoucher({
  voucherName,
  voucherCode,
  status = "ACTIVE",
  maxUsage,
  createdByAdmin = null
}) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/909c64a8-8c02-4858-aa5d-41feb095cd4a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'voucherModel.js:69',message:'createVoucher called',data:{voucherName,voucherCode,maxUsage},sessionId:'debug-session',runId:'run1',hypothesisId:'MODEL',timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  try {
    const pool = await getPool();
    const voucherId = require('crypto').randomUUID();

    const request = pool.request()
      .input("VoucherId", sql.UniqueIdentifier, voucherId)
      .input("VoucherName", sql.NVarChar(50), voucherName)
      .input("VoucherCode", sql.NVarChar(50), voucherCode)
      .input("Status", sql.NVarChar(50), status)
      .input("MaxUsage", sql.Int, maxUsage);
    
    let insertFields = "VoucherId, VoucherName, VoucherCode, Status, MaxUsage";
    let insertValues = "@VoucherId, @VoucherName, @VoucherCode, @Status, @MaxUsage";
    
    if (createdByAdmin) {
      request.input("CreatedByAdmin", sql.UniqueIdentifier, createdByAdmin);
      insertFields += ", CreatedByAdmin";
      insertValues += ", @CreatedByAdmin";
    }

    const result = await request.query(`
      INSERT INTO Vouchers
        (${insertFields})
      OUTPUT inserted.*
      VALUES (${insertValues})
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
 * Bar tạo voucher - tự động approve
 */
async function createBarVoucher({
  barPageId,
  voucherName,
  voucherCode,
  maxUsage,
  originalValue
}) {
  const pool = await getPool();
  const voucherId = require('crypto').randomUUID();

  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("VoucherName", sql.NVarChar(50), voucherName)
    .input("VoucherCode", sql.NVarChar(50), voucherCode)
    .input("MaxUsage", sql.Int, maxUsage)
    .input("OriginalValue", sql.Decimal(18, 2), originalValue)
    .query(`
      INSERT INTO Vouchers
        (VoucherId, BarPageId, VoucherName, VoucherCode, 
         Status, MaxUsage, OriginalValue, VoucherStatus, VoucherType, SentToAdminAt)
      OUTPUT inserted.*
      VALUES 
        (@VoucherId, @BarPageId, @VoucherName, @VoucherCode,
         'ACTIVE', @MaxUsage, @OriginalValue, 'approved', 'bar_created', GETDATE())
    `);

  return result.recordset[0];
}

/**
 * Admin duyệt voucher từ bar
 */
async function approveBarVoucher(voucherId, managerId) {
  const pool = await getPool();
  await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .query(`
      UPDATE Vouchers
      SET VoucherStatus = 'approved',
          ApprovedBy = @ManagerId,
          ApprovedAt = GETDATE(),
          Status = 'ACTIVE'
      WHERE VoucherId = @VoucherId
    `);
  
  return await getVoucherById(voucherId);
}

/**
 * Admin từ chối voucher từ bar
 */
async function rejectBarVoucher(voucherId, managerId, rejectedReason) {
  const pool = await getPool();
  await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .input("ManagerId", sql.UniqueIdentifier, managerId)
    .input("RejectedReason", sql.NVarChar(sql.MAX), rejectedReason)
    .query(`
      UPDATE Vouchers
      SET VoucherStatus = 'rejected',
          ApprovedBy = @ManagerId,
          ApprovedAt = GETDATE(),
          RejectedReason = @RejectedReason,
          Status = 'INACTIVE'
      WHERE VoucherId = @VoucherId
    `);
  
  return await getVoucherById(voucherId);
}

/**
 * Lấy vouchers do bar tạo (chờ duyệt) - DEPRECATED: Không còn dùng nữa
 */
async function getBarVouchersPending() {
  try {
    console.log("[VoucherModel] getBarVouchersPending called");
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT v.*,
          bp.BarName,
          bp.Email AS BarEmail
        FROM Vouchers v
        INNER JOIN BarPages bp ON v.BarPageId = bp.BarPageId
        WHERE v.VoucherStatus = 'pending'
          AND v.BarPageId IS NOT NULL
          AND v.VoucherType = 'bar_created'
        ORDER BY v.SentToAdminAt DESC
      `);
    console.log("[VoucherModel] getBarVouchersPending - Query executed, found:", result.recordset?.length || 0);
    return result.recordset;
  } catch (error) {
    console.error("[VoucherModel] getBarVouchersPending error:", error);
    console.error("[VoucherModel] getBarVouchersPending error stack:", error.stack);
    throw error;
  }
}

/**
 * Lấy tất cả vouchers từ bar kèm thống kê doanh thu
 * @param {string} barPageId - Optional: Filter theo barPageId
 */
async function getBarVouchersWithStats(barPageId = null) {
  try {
    console.log("[VoucherModel] getBarVouchersWithStats called, barPageId:", barPageId);
    const pool = await getPool();
    
    let query = `
      SELECT 
        -- Các cột từ Vouchers
        v.VoucherId,
        v.BarPageId,
        v.VoucherName,
        v.VoucherCode,
        v.Status,
        v.MaxUsage,
        v.UsedCount,
        v.OriginalValue,
        v.VoucherStatus,
        v.VoucherType,
        v.CreatedAt,
        v.SentToAdminAt,
        v.ApprovedBy,
        v.ApprovedAt,
        v.RejectedReason,
        -- Các cột từ BarPages
        bp.BarName,
        bp.Email AS BarEmail,
        -- Thống kê từ VoucherDistributions
        COUNT(DISTINCT vd.DistributionId) AS TotalDistributed,
        SUM(ISNULL(vd.SystemProfit, 0)) AS TotalSystemProfit,
        SUM(ISNULL(vd.AdminProfit, 0)) AS TotalAdminProfit,
        SUM(ISNULL(vd.UserBenefit, 0)) AS TotalUserBenefit,
        -- Thống kê từ BookedSchedules (nếu có)
        COUNT(DISTINCT bs.BookedScheduleId) AS TotalBookings,
        SUM(ISNULL(bs.DepositAmount, 0)) AS TotalDeposits
      FROM Vouchers v
      INNER JOIN BarPages bp ON v.BarPageId = bp.BarPageId
      LEFT JOIN VoucherDistributions vd ON v.VoucherId = vd.VoucherId
      LEFT JOIN BookedSchedules bs ON vd.BookedScheduleId = bs.BookedScheduleId
      WHERE v.BarPageId IS NOT NULL
        AND v.VoucherType = 'bar_created'
    `;
    
    const request = pool.request();
    if (barPageId) {
      query += ` AND v.BarPageId = @BarPageId`;
      request.input("BarPageId", sql.UniqueIdentifier, barPageId);
    }
    
    query += `
      GROUP BY 
        v.VoucherId, v.BarPageId, v.VoucherName, v.VoucherCode, v.Status,
        v.MaxUsage, v.UsedCount, v.OriginalValue, v.VoucherStatus, v.VoucherType,
        v.CreatedAt, v.SentToAdminAt, v.ApprovedBy, v.ApprovedAt, v.RejectedReason,
        bp.BarPageId, bp.BarName, bp.Email
      ORDER BY v.SentToAdminAt DESC
    `;
    
    const result = await request.query(query);
    console.log("[VoucherModel] getBarVouchersWithStats - Query executed, found:", result.recordset?.length || 0);
    return result.recordset;
  } catch (error) {
    console.error("[VoucherModel] getBarVouchersWithStats error:", error);
    console.error("[VoucherModel] getBarVouchersWithStats error stack:", error.stack);
    throw error;
  }
}

/**
 * Lấy danh sách các bar đã tạo voucher (để filter)
 */
async function getBarsWithVouchers() {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT DISTINCT
          bp.BarPageId,
          bp.BarName,
          bp.Email AS BarEmail,
          COUNT(DISTINCT v.VoucherId) AS TotalVouchers,
          SUM(ISNULL(vd.SystemProfit, 0)) AS TotalSystemProfit,
          COUNT(DISTINCT vd.DistributionId) AS TotalDistributed
        FROM BarPages bp
        INNER JOIN Vouchers v ON bp.BarPageId = v.BarPageId
        LEFT JOIN VoucherDistributions vd ON v.VoucherId = vd.VoucherId
        WHERE v.VoucherType = 'bar_created'
        GROUP BY bp.BarPageId, bp.BarName, bp.Email
        ORDER BY bp.BarName ASC
      `);
    return result.recordset;
  } catch (error) {
    console.error("[VoucherModel] getBarsWithVouchers error:", error);
    throw error;
  }
}

/**
 * Lấy vouchers của một bar
 */
async function getVouchersByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT v.*
      FROM Vouchers v
      WHERE v.BarPageId = @BarPageId
        AND v.VoucherType = 'bar_created'
      ORDER BY v.CreatedAt DESC
    `);
  return result.recordset;
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
    'voucherName',
    'voucherCode', 'status', 'maxUsage'
  ];

  fields.forEach(field => {
    if (updates[field] !== undefined) {
      const sqlField = field.charAt(0).toUpperCase() + field.slice(1);

      // Define correct SQL types for each field
      let sqlType;
      switch (field) {
        case 'maxUsage':
          sqlType = sql.Int;
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
 * Kiểm tra voucher có hợp lệ không
 */
async function validateVoucher(voucherCode, comboValue) {
  const voucher = await getVoucherByCode(voucherCode);
  if (!voucher) return { valid: false, reason: "Voucher không tồn tại" };

  if (voucher.Status !== "ACTIVE") return { valid: false, reason: "Voucher không hoạt động" };
  if (voucher.UsedCount >= voucher.MaxUsage) return { valid: false, reason: "Voucher đã hết lượt sử dụng" };

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
  createBarVoucher,
  approveBarVoucher,
  rejectBarVoucher,
  getBarVouchersPending,
  getBarVouchersWithStats,
  getBarsWithVouchers,
  getVouchersByBarPageId,
  updateVoucher,
  incrementUsedCount,
  validateVoucher,
  deleteVoucher,
  countVouchers,
  getActiveVouchers
};
