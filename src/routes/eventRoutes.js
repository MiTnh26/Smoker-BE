const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { verifyToken, requireActiveEntity } = require("../middleware/authMiddleware");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary"); // import đúng hàm tạo upload

// Tạo instance upload riêng cho thư mục "events"
const upload = createCloudinaryUpload("events");

// 📦 Lấy danh sách sự kiện của quán bar
router.get("/bar/:barPageId", EventController.getByBar);

// 📸 Tạo mới một sự kiện (có upload hình)
router.post("/", verifyToken, requireActiveEntity, upload.single("Picture"), EventController.create);

module.exports = router;
