const express = require("express");
const router = express.Router();
const { bankInfoController } = require("../controllers");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// ➕ Tạo BankInfo mới
router.post("/", bankInfoController.createBankInfo);

// 📖 Lấy BankInfo theo ID
router.get("/:bankInfoId", bankInfoController.getBankInfoById);

// 📖 Lấy BankInfo theo AccountId
router.get("/account/:accountId", bankInfoController.getBankInfoByAccountId);

// 📖 Lấy BankInfo theo BarPageId
router.get("/bar/:barPageId", bankInfoController.getBankInfoByBarPageId);

// ✏️ Cập nhật BankInfo
router.put("/:bankInfoId", bankInfoController.updateBankInfo);

// 🗑️ Xóa BankInfo
router.delete("/:bankInfoId", bankInfoController.deleteBankInfo);

module.exports = router;

