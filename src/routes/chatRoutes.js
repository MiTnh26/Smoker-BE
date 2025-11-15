const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
router.post('/conversation', authMiddleware, chatController.getOrCreateConversation);
// Lấy danh sách cuộc trò chuyện của user
router.get('/conversations', authMiddleware, chatController.getUserConversations);
// Gửi tin nhắn
router.post('/message', authMiddleware, chatController.sendMessage);
// Lấy danh sách tin nhắn của 1 cuộc trò chuyện
router.get('/messages/:conversationId', authMiddleware, chatController.getMessages);
// Đánh dấu tin nhắn đã đọc
router.post('/messages/read', authMiddleware, chatController.markMessagesRead);

module.exports = router;
