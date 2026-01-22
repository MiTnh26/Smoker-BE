const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo VoucherDistribution khi admin phân phối voucher cho người dùng
 */
async function createDistribution({
  voucherId,
  userVoucherId = null,
  bookedScheduleId = null,
  adminId,
  userId,
  originalValue,
  salePrice,
  adminProfit,
  systemProfit,
  userBenefit,
  status = 'pending'
}) {
  const pool = await getPool();
  const crypto = require('crypto');
  const distributionId = crypto.randomUUID();
  
  await pool.request()
    .input("DistributionId", sql.UniqueIdentifier, distributionId)
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .input("UserVoucherId", sql.UniqueIdentifier, userVoucherId || null)
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId || null)
    .input("AdminId", sql.UniqueIdentifier, adminId)
    .input("UserId", sql.UniqueIdentifier, userId || null)
    .input("OriginalValue", sql.Decimal(18, 2), originalValue)
    .input("SalePrice", sql.Decimal(18, 2), salePrice)
    .input("AdminProfit", sql.Decimal(18, 2), adminProfit)
    .input("SystemProfit", sql.Decimal(18, 2), systemProfit)
    .input("UserBenefit", sql.Decimal(18, 2), userBenefit)
    .input("Status", sql.NVarChar(50), status)
    .query(`
      INSERT INTO VoucherDistributions
        (DistributionId, VoucherId, UserVoucherId, BookedScheduleId, AdminId, UserId,
         OriginalValue, SalePrice, AdminProfit, SystemProfit, UserBenefit, Status, DistributedAt)
      VALUES
        (@DistributionId, @VoucherId, @UserVoucherId, @BookedScheduleId, @AdminId, @UserId,
         @OriginalValue, @SalePrice, @AdminProfit, @SystemProfit, @UserBenefit, @Status, GETDATE())
    `);
  
  return await findById(distributionId);
}

/**
 * Tìm distribution theo ID
 */
async function findById(distributionId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("DistributionId", sql.UniqueIdentifier, distributionId)
    .query(`
      SELECT vd.*,
        v.VoucherName AS OriginalVoucherName,
        v.VoucherCode AS OriginalVoucherCode,
        uv.VoucherCode AS UserVoucherCode,
        m.Email AS AdminEmail,
        a.UserName AS UserName,
        bs.BookingDate
      FROM VoucherDistributions vd
      LEFT JOIN Vouchers v ON vd.VoucherId = v.VoucherId
      LEFT JOIN Vouchers uv ON vd.UserVoucherId = uv.VoucherId
      LEFT JOIN Managers m ON vd.AdminId = m.ManagerId
      LEFT JOIN Accounts a ON vd.UserId = a.AccountId
      LEFT JOIN BookedSchedules bs ON vd.BookedScheduleId = bs.BookedScheduleId
      WHERE vd.DistributionId = @DistributionId
    `);
  return result.recordset[0] || null;
}

/**
 * Tìm distribution theo BookedScheduleId
 */
async function findByBookedScheduleId(bookedScheduleId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BookedScheduleId", sql.UniqueIdentifier, bookedScheduleId)
    .query(`
      SELECT vd.*,
        v.VoucherName AS OriginalVoucherName,
        v.VoucherCode AS OriginalVoucherCode,
        uv.VoucherCode AS UserVoucherCode
      FROM VoucherDistributions vd
      LEFT JOIN Vouchers v ON vd.VoucherId = v.VoucherId
      LEFT JOIN Vouchers uv ON vd.UserVoucherId = uv.VoucherId
      WHERE vd.BookedScheduleId = @BookedScheduleId
    `);
  return result.recordset[0] || null;
}

/**
 * Tìm distribution theo VoucherId (voucher gốc từ bar)
 */
async function findByVoucherId(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`
      SELECT vd.*,
        uv.VoucherCode AS UserVoucherCode,
        bs.BookingDate
      FROM VoucherDistributions vd
      LEFT JOIN Vouchers uv ON vd.UserVoucherId = uv.VoucherId
      LEFT JOIN BookedSchedules bs ON vd.BookedScheduleId = bs.BookedScheduleId
      WHERE vd.VoucherId = @VoucherId
      ORDER BY vd.DistributedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy tất cả distributions với filter
 */
async function getAllDistributions({ 
  adminId, 
  userId, 
  status, 
  limit = 50, 
  offset = 0 
} = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (adminId) {
    request.input("AdminId", sql.UniqueIdentifier, adminId);
    whereConditions.push("vd.AdminId = @AdminId");
  }
  
  if (userId) {
    request.input("UserId", sql.UniqueIdentifier, userId);
    whereConditions.push("vd.UserId = @UserId");
  }
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("vd.Status = @Status");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT vd.*,
      v.VoucherName AS OriginalVoucherName,
      v.VoucherCode AS OriginalVoucherCode,
      uv.VoucherCode AS UserVoucherCode,
      m.Email AS AdminEmail,
      a.UserName AS UserName,
      bs.BookingDate
    FROM VoucherDistributions vd
    LEFT JOIN Vouchers v ON vd.VoucherId = v.VoucherId
    LEFT JOIN Vouchers uv ON vd.UserVoucherId = uv.VoucherId
    LEFT JOIN Managers m ON vd.AdminId = m.ManagerId
    LEFT JOIN Accounts a ON vd.UserId = a.AccountId
    LEFT JOIN BookedSchedules bs ON vd.BookedScheduleId = bs.BookedScheduleId
    ${whereClause}
    ORDER BY vd.DistributedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Update distribution status
 */
async function updateStatus(distributionId, status, usedAt = null) {
  const pool = await getPool();
  const request = pool.request()
    .input("DistributionId", sql.UniqueIdentifier, distributionId)
    .input("Status", sql.NVarChar(50), status);
  
  let updates = ["Status = @Status"];
  
  if (usedAt !== null) {
    request.input("UsedAt", sql.DateTime2, usedAt);
    updates.push("UsedAt = @UsedAt");
  } else if (status === 'used') {
    updates.push("UsedAt = GETDATE()");
  }
  
  await request.query(`
    UPDATE VoucherDistributions
    SET ${updates.join(", ")}
    WHERE DistributionId = @DistributionId
  `);
  
  return await findById(distributionId);
}

/**
 * Tính toán profit từ OriginalValue và SalePrice
 */
function calculateProfit(originalValue, salePrice) {
  const adminProfit = salePrice; // Admin được 100% salePrice
  const systemProfit = originalValue - salePrice; // Hệ thống lời phần còn lại
  const userBenefit = originalValue - salePrice; // Người dùng lời phần chênh lệch
  
  return {
    adminProfit,
    systemProfit,
    userBenefit
  };
}

module.exports = {
  createDistribution,
  findById,
  findByBookedScheduleId,
  findByVoucherId,
  getAllDistributions,
  updateStatus,
  calculateProfit
};
