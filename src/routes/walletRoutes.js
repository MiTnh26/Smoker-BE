const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const walletController = require("../controllers/walletController");

router.get("/", verifyToken, walletController.getWallet);
router.get("/transactions", verifyToken, walletController.getTransactionHistory);
router.post("/withdraw", verifyToken, walletController.createWithdrawRequest);
router.get("/withdraw-requests", verifyToken, walletController.getWithdrawRequests);
router.post("/set-pin", verifyToken, walletController.setPin);
router.post("/verify-pin", verifyToken, walletController.verifyPin);

module.exports = router;

