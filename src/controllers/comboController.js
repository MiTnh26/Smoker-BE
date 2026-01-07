const {
  getCombosByBarId,
  getComboById,
  createCombo,
  updateCombo,
  deleteCombo
} = require("../models/comboModel");

exports.getCombos = async (req, res) => {
  try {
    const { barPageId } = req.params; // trùng FE
    if (!barPageId) return res.status(400).json({ status: "error", message: "Thiếu barPageId trong URL" });

    const combos = await getCombosByBarId(barPageId);
    return res.status(200).json({ status: "success", data: combos || [] });
  } catch (err) {
    console.error("getCombos error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạo combo
exports.createCombo = async (req, res) => {
  try {
    const { comboName, barPageId, price = 0, description = null } = req.body;
    if (!comboName || !barPageId) return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const combo = await createCombo({ comboName, barId: barPageId, price, description });
    return res.status(201).json({ status: "success", data: combo });
  } catch (err) {
    console.error("createCombo error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};


// 🔹 Cập nhật combo
exports.updateCombo = async (req, res) => {
  try {
    const { comboId } = req.params;
    const { comboName, price, description } = req.body;

    if (!comboId) {
      return res.status(400).json({ status: "error", message: "Thiếu comboId" });
    }

    const updated = await updateCombo(comboId, { comboName, price, description });

    if (!updated) {
      return res.status(404).json({ status: "error", message: "Không tìm thấy combo để cập nhật" });
    }

    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("updateCombo error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

// 🔹 Xóa combo
exports.deleteCombo = async (req, res) => {
  try {
    const { comboId } = req.params;
    if (!comboId) {
      return res.status(400).json({ status: "error", message: "Thiếu comboId" });
    }

    await deleteCombo(comboId);
    return res.status(200).json({ status: "success", message: "Xóa combo thành công" });
  } catch (err) {
    console.error("deleteCombo error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};
