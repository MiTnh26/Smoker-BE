const chatService = require('../services/chatService');
const { getIO } = require('../utils/socket');

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
async function getOrCreateConversation(req, res) {
    try {
        const { participant1Id, participant2Id } = req.body;
        if (!participant1Id || !participant2Id) return res.status(400).json({ message: 'Missing participant ids' });
        const conversation = await chatService.getOrCreateConversationService(participant1Id, participant2Id);
        res.json(conversation);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

// Lấy danh sách cuộc trò chuyện của 1 user
async function getUserConversations(req, res) {
    try {
        const userId = req.user.userId;
        const conversations = await chatService.getUserConversationsService(userId);
        res.json(conversations);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

// Gửi tin nhắn
async function sendMessage(req, res) {
    try {
        const { conversationId, content, messageType } = req.body;
        const senderId = req.user.userId;
        if (!conversationId || !content) return res.status(400).json({ message: 'Missing data' });
    const message = await chatService.sendMessageService(conversationId, senderId, content, messageType);

    // Lấy thông tin cuộc trò chuyện để xác định người nhận
    const conversation = await chatService.getConversationByIdService(conversationId);
    let receiverId = (senderId === conversation.participant1Id) ? conversation.participant2Id : conversation.participant1Id;
// console.log('Emit new_message to', receiverId, message);
    // Phát sự kiện realtime cho người nhận
    getIO().to(String(receiverId)).emit('new_message', message);

    res.json(message);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

// Lấy danh sách tin nhắn của 1 cuộc trò chuyện
async function getMessages(req, res) {
    try {
        const { conversationId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        const messages = await chatService.getMessagesService(conversationId, parseInt(limit), parseInt(offset));
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

// Đánh dấu tin nhắn đã đọc
async function markMessagesRead(req, res) {
    try {
        const { conversationId } = req.body;
        const userId = req.user.userId;
        await chatService.markMessagesReadService(conversationId, userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

module.exports = {
    getOrCreateConversation,
    getUserConversations,
    sendMessage,
    getMessages,
    markMessagesRead
};
