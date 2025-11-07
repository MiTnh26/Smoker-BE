
const Message = require("../models/messageDocument");
const mongoose = require("mongoose");
const { getIO } = require('../utils/socket');

class MessageController {
  // Tạo hoặc lấy cuộc trò chuyện giữa 2 user
  async getOrCreateConversation(req, res) {
    try {
      const { participant1Id, participant2Id } = req.body;
      if (!participant1Id || !participant2Id) {
        return res.status(400).json({ success: false, message: "Missing participant ids" });
      }
      let conversation = await Message.findOne({
        $or: [
          { "Người 1": participant1Id, "Người 2": participant2Id },
          { "Người 1": participant2Id, "Người 2": participant1Id }
        ]
      });
      if (!conversation) {
        conversation = new Message({
          "Người 1": participant1Id,
          "Người 2": participant2Id,
          "Cuộc Trò Chuyện": {}
        });
        await conversation.save();
      }
      res.status(200).json({ success: true, data: conversation, message: "Conversation found/created" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Lấy danh sách cuộc trò chuyện của user
  async getUserConversations(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const conversations = await Message.find({
        $or: [
          { "Người 1": userId },
          { "Người 2": userId }
        ]
      }).sort({ updatedAt: -1 });
      res.status(200).json({ success: true, data: conversations, message: "Conversations retrieved successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Gửi tin nhắn
  async sendMessage(req, res) {
    try {
      const { conversationId, content, messageType = "text" } = req.body;
      const senderId = req.user?.id;
      if (!senderId || !conversationId || !content) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      let conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      const messageId = new mongoose.Types.ObjectId().toString();
      const message = {
        "Nội Dung Tin Nhắn": content,
        "Gửi Lúc": new Date(),
        "Người Gửi": senderId,
        "Loại": messageType
      };
      conversation["Cuộc Trò Chuyện"].set(messageId, message);
      await conversation.save();

      // Xác định receiverId
      let receiverId = null;
      if (String(conversation["Người 1"]) === String(senderId)) {
        receiverId = conversation["Người 2"];
      } else {
        receiverId = conversation["Người 1"];
      }

      // Gửi realtime qua socket.io
      try {
        getIO().to(String(receiverId)).emit('new_message', {
          conversationId,
          messageId,
          ...message
        });
      } catch (e) {
        // Nếu socket chưa init thì bỏ qua, không crash
      }

      res.status(201).json({ success: true, data: { messageId, content, senderId, messageType }, message: "Message sent" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Lấy danh sách tin nhắn của 1 cuộc trò chuyện
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      // Trả về mảng tin nhắn (convert từ Map sang Array)
      const messages = Array.from(conversation["Cuộc Trò Chuyện"].values());
      res.status(200).json({ success: true, data: messages, message: "Messages retrieved" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markMessagesRead(req, res) {
    try {
      const { conversationId } = req.body;
      const userId = req.user?.id;
      if (!userId || !conversationId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      let updated = false;
      conversation["Cuộc Trò Chuyện"].forEach((msg, key) => {
        if (msg["Người Gửi"] !== userId && !msg["Đã Đọc"]) {
          msg["Đã Đọc"] = true;
          conversation["Cuộc Trò Chuyện"].set(key, msg);
          updated = true;
        }
      });
      if (updated) await conversation.save();
      res.status(200).json({ success: true, message: "Messages marked as read" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }
}

module.exports = new MessageController();
