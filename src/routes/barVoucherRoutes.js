const express = require("express");
const router = express.Router();
const barVoucherController = require("../controllers/barVoucherController");
const { verifyToken } = require("../middleware/authMiddleware");

// Debug middleware
router.use((req, res, next) => {
  console.log(`[BarVoucherRoutes] ${req.method} ${req.path}`, {
    originalUrl: req.originalUrl,
    url: req.url
  });
  next();
});

// Bar tạo voucher và gửi cho admin
router.post("/", verifyToken, barVoucherController.createVoucher);

// Bar xem danh sách voucher đã tạo
router.get("/", verifyToken, barVoucherController.getMyVouchers);

module.exports = router;
