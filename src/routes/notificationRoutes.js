const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// Notification routes
router.post("/", notificationController.createNotification);
router.get("/", notificationController.getNotifications);
router.get("/unread-count", notificationController.getUnreadCount);
router.put("/:notificationId/read", notificationController.markAsRead);
router.put("/read-all", notificationController.markAllAsRead);

module.exports = router;
