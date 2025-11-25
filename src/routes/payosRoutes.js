const express = require("express");
const router = express.Router();
const payosController = require("../controllers/payosController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tạo payment link
// POST /api/pay/create
router.post("/create", verifyToken, payosController.createPayment);

// Webhook endpoint từ PayOS (không cần auth vì PayOS gọi trực tiếp)
// POST /api/pay/webhook
router.post("/webhook", payosController.handleWebhook);

// Lấy thông tin payment
// GET /api/pay/info/:orderCode
router.get("/info/:orderCode", verifyToken, payosController.getPaymentInfo);

// Hủy payment link
// POST /api/pay/cancel/:orderCode
router.post("/cancel/:orderCode", verifyToken, payosController.cancelPayment);

module.exports = router;

