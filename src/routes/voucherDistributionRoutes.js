const express = require("express");
const router = express.Router();
const voucherDistributionController = require("../controllers/voucherDistributionController");
const { verifyToken } = require("../middleware/authMiddleware");

// Admin phân phối voucher cho người dùng khi đặt bàn
router.post("/", verifyToken, voucherDistributionController.distributeVoucher);

// Lấy danh sách distributions
router.get("/", verifyToken, voucherDistributionController.getDistributions);

module.exports = router;
