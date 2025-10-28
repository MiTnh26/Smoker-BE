const { getPool, sql } = require("../db/sqlserver");

// Lấy tất cả VoucherApply
async function getAllVoucherApplies() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`SELECT VoucherApplyId FROM VoucherApplies`);
  return result.recordset;
}

// Lấy VoucherApply theo Id
async function getVoucherApplyById(voucherApplyId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId)
    .query(`SELECT VoucherApplyId FROM VoucherApplies WHERE VoucherApplyId = @VoucherApplyId`);
  return result.recordset[0] || null;
}

// Tạo VoucherApply mới
async function createVoucherApply() {
  const pool = await getPool();
  const result = await pool.request()
    .query(`INSERT INTO VoucherApplies (VoucherApplyId) OUTPUT inserted.* VALUES (NEWID())`);
  return result.recordset[0];
}
// Cập nhật VoucherApply (dummy, vì table chỉ có VoucherApplyId)
async function updateVoucherApply(voucherApplyId) {
  // Nếu cần cập nhật thêm trường trong tương lai
  const pool = await getPool();
  const result = await pool.request()
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId)
    .query(`
      UPDATE VoucherApplies
      SET VoucherApplyId = VoucherApplyId
      OUTPUT inserted.*
      WHERE VoucherApplyId = @VoucherApplyId
    `);
  return result.recordset[0] || null;
}

// Xóa VoucherApply
async function deleteVoucherApply(voucherApplyId) {
  const pool = await getPool();
  await pool.request()
    .input("VoucherApplyId", sql.UniqueIdentifier, voucherApplyId)
    .query(`DELETE FROM VoucherApplies WHERE VoucherApplyId = @VoucherApplyId`);
  return true;
}

module.exports = {
  updateVoucherApply,
  getAllVoucherApplies,
  getVoucherApplyById,
  createVoucherApply,
  deleteVoucherApply,
};
