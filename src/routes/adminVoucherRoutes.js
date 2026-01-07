const express = require("express");
const router = express.Router();
const adminVoucherController = require("../controllers/adminVoucherController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều require admin token
// (Trong middleware có thể check thêm role admin nếu cần)

// GET /api/admin/vouchers - Lấy danh sách vouchers
router.get("/", verifyToken, adminVoucherController.getVouchers);

// GET /api/admin/vouchers/stats - Thống kê voucher
router.get("/stats", verifyToken, adminVoucherController.getVoucherStats);

// GET /api/admin/vouchers/:id - Lấy voucher theo ID
router.get("/:id", verifyToken, adminVoucherController.getVoucherById);

// POST /api/admin/vouchers - Tạo voucher mới
router.post("/", verifyToken, adminVoucherController.createVoucher);

// PUT /api/admin/vouchers/:id - Cập nhật voucher
router.put("/:id", verifyToken, adminVoucherController.updateVoucher);

// DELETE /api/admin/vouchers/:id - Xóa voucher
router.delete("/:id", verifyToken, adminVoucherController.deleteVoucher);

module.exports = router;



