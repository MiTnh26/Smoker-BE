const {
  getVouchersByBarId,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher
} = require("../models/voucherModel");

// ✅ Lấy tất cả voucher theo BarPageId
exports.getVouchers = async (req, res) => {
  try {
    const { barPageId } = req.params;
    if (!barPageId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu barPageId trong URL"
      });
    }

    const vouchers = await getVouchersByBarId(barPageId);
    return res.status(200).json({
      status: "success",
      data: vouchers || []
    });
  } catch (err) {
    console.error("getVouchers error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

// ✅ Lấy chi tiết voucher theo id
exports.getVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    if (!voucherId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu voucherId trong URL"
      });
    }

    const voucher = await getVoucherById(voucherId);
    if (!voucher) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy voucher"
      });
    }

    return res.status(200).json({
      status: "success",
      data: voucher
    });
  } catch (err) {
    console.error("getVoucher error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

// ✅ Tạo voucher mới
exports.createVoucher = async (req, res) => {
  try {
    const { barId, voucherApplyId, startDate, endDate, discountPercentage, voucherName } = req.body;

    if (!barId || !voucherName) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu dữ liệu bắt buộc (barId, voucherName)"
      });
    }

    const newVoucher = await createVoucher({
      barId,
      voucherApplyId,
      startDate,
      endDate,
      discountPercentage,
      voucherName
    });

    return res.status(201).json({
      status: "success",
      data: newVoucher
    });
  } catch (err) {
    console.error("createVoucher error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

// ✅ Cập nhật voucher
exports.updateVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    if (!voucherId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu voucherId trong URL"
      });
    }

    const updated = await updateVoucher(voucherId, req.body);
    if (!updated) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy voucher để cập nhật"
      });
    }

    return res.status(200).json({
      status: "success",
      data: updated
    });
  } catch (err) {
    console.error("updateVoucher error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};

// ✅ Xóa voucher
exports.deleteVoucher = async (req, res) => {
  try {
    const { voucherId } = req.params;
    if (!voucherId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu voucherId trong URL"
      });
    }

    await deleteVoucher(voucherId);
    return res.status(200).json({
      status: "success",
      message: "Xóa voucher thành công"
    });
  } catch (err) {
    console.error("deleteVoucher error:", err);
    return res.status(500).json({
      status: "error",
      message: err.message
    });
  }
};
