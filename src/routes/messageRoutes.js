const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// Message routes
router.post("/", messageController.createMessage);
router.get("/conversations", messageController.getConversations);
router.get("/:userId", messageController.getMessages);

module.exports = router;
