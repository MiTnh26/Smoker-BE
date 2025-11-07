const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
router.post('/conversation', verifyToken, messageController.getOrCreateConversation);
// Lấy danh sách cuộc trò chuyện của user
router.get('/conversations', verifyToken, messageController.getUserConversations);
// Gửi tin nhắn
router.post('/message', verifyToken, messageController.sendMessage);
// Lấy danh sách tin nhắn của 1 cuộc trò chuyện
router.get('/messages/:conversationId', verifyToken, messageController.getMessages);
// Đánh dấu tin nhắn đã đọc
router.post('/messages/read', verifyToken, messageController.markMessagesRead);

module.exports = router;
