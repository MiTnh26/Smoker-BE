const conversationAccess = require('../models/conversationModel');
const messageAccess = require('../models/messageModel');

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
async function getOrCreateConversationService(participant1Id, participant2Id) {
    return await conversationAccess.findOrCreateConversation(participant1Id, participant2Id);
}

// Lấy danh sách cuộc trò chuyện của 1 user
async function getUserConversationsService(userId) {
    return await conversationAccess.getConversationsByUser(userId);
}

// Gửi tin nhắn
async function sendMessageService(conversationId, senderId, content, messageType = 'text') {
    return await messageAccess.addMessage(conversationId, senderId, content, messageType);
}

// Lấy danh sách tin nhắn của 1 cuộc trò chuyện
async function getMessagesService(conversationId, limit = 50, offset = 0) {
    return await messageAccess.getMessagesByConversation(conversationId, limit, offset);
}


// Lấy thông tin cuộc trò chuyện theo conversationId
async function getConversationByIdService(conversationId) {
    // conversationAccess chưa có hàm này, cần bổ sung ở access nếu chưa có
    return await conversationAccess.getConversationById(conversationId);
}

// Đánh dấu tin nhắn đã đọc
async function markMessagesReadService(conversationId, userId) {
    await messageAccess.markMessagesAsRead(conversationId, userId);
}

module.exports = {
    getOrCreateConversationService,
    getUserConversationsService,
    sendMessageService,
    getMessagesService,
    getConversationByIdService,
    markMessagesReadService
};
