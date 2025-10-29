const express = require("express");
const router = express.Router();
const voucherApplyController = require("../controllers/voucherApplyController");

// 🔹 Lấy tất cả VoucherApply
router.get("/", voucherApplyController.getVoucherApplies);

// 🔹 Lấy 1 VoucherApply theo ID
router.get("/:voucherApplyId", voucherApplyController.getVoucherApply);

// 🔹 Tạo mới VoucherApply
router.post("/", voucherApplyController.createVoucherApply);

// 🔹 Cập nhật VoucherApply
router.put("/:voucherApplyId", voucherApplyController.updateVoucherApply);

// 🔹 Xóa VoucherApply
router.delete("/:voucherApplyId", voucherApplyController.deleteVoucherApply);

module.exports = router;
