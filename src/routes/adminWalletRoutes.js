const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");
const adminWalletController = require("../controllers/adminWalletController");

// Routes: /api/admin/wallet/withdraw-requests
router.get("/wallet/withdraw-requests", verifyToken, requireAdmin, adminWalletController.getAllWithdrawRequests);
router.post("/wallet/withdraw-requests/:withdrawRequestId/approve", verifyToken, requireAdmin, adminWalletController.approveWithdrawRequest);
router.post("/wallet/withdraw-requests/:withdrawRequestId/reject", verifyToken, requireAdmin, adminWalletController.rejectWithdrawRequest);

module.exports = router;

