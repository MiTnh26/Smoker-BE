const express = require("express");
const router = express.Router();
const adminVoucherController = require("../controllers/adminVoucherController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều require admin token
// (Trong middleware có thể check thêm role admin nếu cần)

// IMPORTANT: Specific routes must be registered BEFORE dynamic routes (/:id)
// to avoid route conflicts

// GET /api/admin/vouchers - Lấy danh sách vouchers
router.get("/", verifyToken, adminVoucherController.getVouchers);

// GET /api/admin/vouchers/stats - Thống kê voucher
router.get("/stats", verifyToken, adminVoucherController.getVoucherStats);

// GET /api/admin/vouchers/code/:code - Lấy voucher theo code (public, không cần auth)
router.get("/code/:code", adminVoucherController.getVoucherByCode);

// GET /api/admin/vouchers/bar-vouchers/bars - Lấy danh sách các bar đã tạo voucher (must be before /bar-vouchers)
router.get("/bar-vouchers/bars", verifyToken, adminVoucherController.getBarsWithVouchers);

// GET /api/admin/vouchers/bar-vouchers/pending - DEPRECATED: Xem voucher do bar tạo chờ duyệt (must be before /bar-vouchers)
router.get("/bar-vouchers/pending", verifyToken, adminVoucherController.getBarVouchersPending);

// GET /api/admin/vouchers/bar-vouchers - Xem voucher do bar tạo kèm thống kê (có thể filter theo barPageId)
router.get("/bar-vouchers", verifyToken, adminVoucherController.getBarVouchersWithStats);

// POST /api/admin/vouchers - Tạo voucher mới
router.post("/", verifyToken, adminVoucherController.createVoucher);

// POST /api/admin/vouchers/:id/approve-bar - DEPRECATED: Duyệt voucher từ bar (must be before /:id)
router.post("/:id/approve-bar", verifyToken, adminVoucherController.approveBarVoucher);

// POST /api/admin/vouchers/:id/reject-bar - DEPRECATED: Từ chối voucher từ bar (must be before /:id)
router.post("/:id/reject-bar", verifyToken, adminVoucherController.rejectBarVoucher);

// GET /api/admin/vouchers/:id - Lấy voucher theo ID (must be after all specific routes)
router.get("/:id", verifyToken, adminVoucherController.getVoucherById);

// PUT /api/admin/vouchers/:id - Cập nhật voucher
router.put("/:id", verifyToken, adminVoucherController.updateVoucher);

// DELETE /api/admin/vouchers/:id - Xóa voucher
router.delete("/:id", verifyToken, adminVoucherController.deleteVoucher);

module.exports = router;



