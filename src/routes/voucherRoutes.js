const express = require("express");
const router = express.Router();
const voucherController = require("../controllers/voucherController");

// Lấy danh sách voucher theo quán
router.get("/bar/:barPageId", voucherController.getVouchers);

// Lấy chi tiết 1 voucher
router.get("/:voucherId", voucherController.getVoucher);

// Tạo voucher mới
router.post("/", voucherController.createVoucher);

// Cập nhật voucher
router.put("/:voucherId", voucherController.updateVoucher);

// Xóa voucher
router.delete("/:voucherId", voucherController.deleteVoucher);

module.exports = router;
