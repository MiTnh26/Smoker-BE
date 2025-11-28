const express = require("express");
const router = express.Router();
const eventAdvertisementController = require("../controllers/eventAdvertisementController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tạo request quảng cáo event
router.post("/", verifyToken, eventAdvertisementController.createAdvertisement);

// Lấy danh sách quảng cáo (cho admin - có thể thêm middleware check admin role)
router.get("/", verifyToken, eventAdvertisementController.getAdvertisements);

module.exports = router;

