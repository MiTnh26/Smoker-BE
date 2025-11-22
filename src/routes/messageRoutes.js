const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const { verifyToken, checkBannedStatus } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
router.post('/conversation', checkBannedStatus, messageController.getOrCreateConversation);
// Lấy danh sách cuộc trò chuyện của user
router.get('/conversations', messageController.getUserConversations);
// Gửi tin nhắn
router.post('/message', checkBannedStatus, messageController.sendMessage);
// Lấy danh sách tin nhắn của 1 cuộc trò chuyện
router.get('/messages/:conversationId', messageController.getMessages);
// Đánh dấu tin nhắn đã đọc
router.post('/messages/read', messageController.markMessagesRead);

module.exports = router;
