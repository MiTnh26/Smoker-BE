const {
  getAllVoucherApplies,
  getVoucherApplyById,
  createVoucherApply,
  updateVoucherApply,
  deleteVoucherApply
} = require("../models/voucherApplyModel");

// Lấy tất cả VoucherApply
exports.getVoucherApplies = async (req, res) => {
  try {
    const applies = await getAllVoucherApplies(); // ✅ gọi đúng hàm getAll
    return res.status(200).json({ status: "success", data: applies });
  } catch (err) {
    console.error("getVoucherApplies error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Lấy 1 VoucherApply theo Id
exports.getVoucherApply = async (req, res) => {
  try {
    const { voucherApplyId } = req.params;
    if (!voucherApplyId)
      return res.status(400).json({ status: "error", message: "Thiếu voucherApplyId" });

    const apply = await getVoucherApplyById(voucherApplyId);
    if (!apply)
      return res.status(404).json({ status: "error", message: "Không tìm thấy VoucherApply" });

    return res.status(200).json({ status: "success", data: apply });
  } catch (err) {
    console.error("getVoucherApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạo VoucherApply
exports.createVoucherApply = async (req, res) => {
  try {
    const newApply = await createVoucherApply(); // ✅ model tự tạo NEWID()
    return res.status(201).json({ status: "success", data: newApply });
  } catch (err) {
    console.error("createVoucherApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Xóa VoucherApply
exports.deleteVoucherApply = async (req, res) => {
  try {
    const { voucherApplyId } = req.params;
    if (!voucherApplyId)
      return res.status(400).json({ status: "error", message: "Thiếu voucherApplyId" });

    await deleteVoucherApply(voucherApplyId);
    return res.status(200).json({ status: "success", message: "Xóa VoucherApply thành công" });
  } catch (err) {
    console.error("deleteVoucherApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
// Cập nhật VoucherApply
exports.updateVoucherApply = async (req, res) => {
  try {
    const { voucherApplyId } = req.params;
    if (!voucherApplyId)
      return res.status(400).json({ status: "error", message: "Thiếu voucherApplyId" });

    const updated = await updateVoucherApply(voucherApplyId);
    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("updateVoucherApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};