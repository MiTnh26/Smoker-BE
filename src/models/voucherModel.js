const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả voucher của một quán (Bar)
async function getVouchersByBarId(barId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .query(`
      SELECT 
        v.VoucherId,
        v.BarId,
        v.VoucherApplyId,
        v.VoucherName,
        v.StartDate,
        v.EndDate,
        v.DiscountPercentage
      FROM Vouchers v
      WHERE v.BarId = @BarId
      ORDER BY v.StartDate DESC
    `);
  return result.recordset;
}

// Lấy voucher theo ID
async function getVoucherById(voucherId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`
      SELECT 
        VoucherId,
        BarId,
        VoucherApplyId,
        VoucherName,
        StartDate,
        EndDate,
        DiscountPercentage
      FROM Vouchers
      WHERE VoucherId = @VoucherId
    `);
  return result.recordset[0] || null;
}

// Tạo voucher mới
async function createVoucher({
  barId,
  voucherApplyId = null,
  voucherName,
  startDate,
  endDate,
  discountPercentage
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarId", sql.UniqueIdentifier, barId)
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId)
    .input("VoucherName", sql.NVarChar(50), voucherName)
    .input("StartDate", sql.Date, startDate)
    .input("EndDate", sql.Date, endDate)
    .input("DiscountPercentage", sql.Int, discountPercentage)
    .query(`
      INSERT INTO Vouchers 
        (BarId, VoucherApplyId, VoucherName, StartDate, EndDate, DiscountPercentage)
      OUTPUT inserted.*
      VALUES (@BarId, @VoucherApplyId, @VoucherName, @StartDate, @EndDate, @DiscountPercentage)
    `);
  return result.recordset[0];
}

// Cập nhật voucher
async function updateVoucher(voucherId, updates) {
  const pool = await getPool();
  const { voucherName, startDate, endDate, discountPercentage, voucherApplyId } = updates;

  const result = await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .input("VoucherName", sql.NVarChar(50), voucherName ?? null)
    .input("StartDate", sql.Date, startDate ?? null)
    .input("EndDate", sql.Date, endDate ?? null)
    .input("DiscountPercentage", sql.Int, discountPercentage ?? null)
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId ?? null)
    .query(`
      UPDATE Vouchers
      SET
        VoucherName = COALESCE(@VoucherName, VoucherName),
        StartDate = COALESCE(@StartDate, StartDate),
        EndDate = COALESCE(@EndDate, EndDate),
        DiscountPercentage = COALESCE(@DiscountPercentage, DiscountPercentage),
        VoucherApplyId = COALESCE(@VoucherApplyId, VoucherApplyId)
      WHERE VoucherId = @VoucherId;

      SELECT * FROM Vouchers WHERE VoucherId = @VoucherId;
    `);
  return result.recordset[0] || null;
}

// Xóa voucher
async function deleteVoucher(voucherId) {
  const pool = await getPool();
  await pool.request()
    .input("VoucherId", sql.UniqueIdentifier, voucherId)
    .query(`DELETE FROM Vouchers WHERE VoucherId = @VoucherId`);
  return true;
}

module.exports = {
  getVouchersByBarId,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher,
};
