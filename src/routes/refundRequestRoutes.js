const express = require("express");
const router = express.Router();
const refundRequestController = require("../controllers/refundRequestController");
const { verifyToken } = require("../middleware/authMiddleware");

// Người dùng yêu cầu hoàn tiền
router.post("/booking/:id/request-refund", verifyToken, refundRequestController.createRefundRequest);

// Kế toán xem danh sách yêu cầu hoàn tiền
router.get("/accountant/refund-requests", verifyToken, refundRequestController.getRefundRequests);

// Kế toán xử lý hoàn tiền (upload minh chứng)
router.post("/accountant/refund-requests/:id/process", verifyToken, refundRequestController.processRefund);

module.exports = router;
