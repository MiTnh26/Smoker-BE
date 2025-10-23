const {
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher
} = require("../models/voucherModel");

// Lấy voucher
exports.getVouchers = async (req, res) => {
  try {
    const vouchers = await getVoucherById(); // hoặc getAll
    return res.status(200).json({ status: "success", data: vouchers });
  } catch (err) {
    console.error("getVouchers error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạo voucher
exports.createVoucher = async (req, res) => {
  try {
    const { barId, voucherApplyId, startDate, endDate, discountPercentage, voucherName } = req.body;
    if (!barId || !voucherName) return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const newVoucher = await createVoucher({ barId, voucherApplyId, startDate, endDate, discountPercentage, voucherName });
    return res.status(201).json({ status: "success", data: newVoucher });
  } catch (err) {
    console.error("createVoucher error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Cập nhật voucher
exports.updateVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    const updates = req.body;
    if (!voucherId) return res.status(400).json({ status: "error", message: "Thiếu voucherId" });

    const updated = await updateVoucher(voucherId, updates);
    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("updateVoucher error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Xóa voucher
exports.deleteVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    if (!voucherId) return res.status(400).json({ status: "error", message: "Thiếu voucherId" });

    await deleteVoucher(voucherId);
    return res.status(200).json({ status: "success", message: "Xóa voucher thành công" });
  } catch (err) {
    console.error("deleteVoucher error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
