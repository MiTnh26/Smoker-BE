const {
  getAllTableApplies,
  getTableApplyById,
  createTableApply,
  updateTableApply,
  deleteTableApply
} = require("../models/tableApplyModel");

// Lấy tất cả TableApply
exports.getTableApplies = async (req, res) => {
  try {
    const tableApplies = await getAllTableApplies(); // ✅ gọi đúng
    return res.status(200).json({ status: "success", data: tableApplies });
  } catch (err) {
    console.error("getTableApplies error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
// Lấy 1 TableApply theo Id
exports.getTableApply = async (req, res) => {
  try {
    const { tableApplyId } = req.params;
    if (!tableApplyId)
      return res.status(400).json({ status: "error", message: "Thiếu tableApplyId" });

    const tableApply = await getTableApplyById(tableApplyId);
    if (!tableApply)
      return res.status(404).json({ status: "error", message: "Không tìm thấy TableApply" });

    return res.status(200).json({ status: "success", data: tableApply });
  } catch (err) {
    console.error("getTableApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạo TableApply
exports.createTableApply = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: "error", message: "Thiếu name" });

    const newApply = await createTableApply({ name }); // ✅ truyền đúng
    return res.status(201).json({ status: "success", data: newApply });
  } catch (err) {
    console.error("createTableApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Cập nhật TableApply
exports.updateTableApply = async (req, res) => {
  try {
    const { tableApplyId } = req.params;
    const { name } = req.body;

    if (!tableApplyId) return res.status(400).json({ status: "error", message: "Thiếu tableApplyId" });

    const updated = await updateTableApply(tableApplyId, { name });
    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("updateTableApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Xóa TableApply
exports.deleteTableApply = async (req, res) => {
  try {
    const { tableApplyId } = req.params;
    if (!tableApplyId) return res.status(400).json({ status: "error", message: "Thiếu tableApplyId" });

    await deleteTableApply(tableApplyId);
    return res.status(200).json({ status: "success", message: "Xóa thành công" });
  } catch (err) {
    console.error("deleteTableApply error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
