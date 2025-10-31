const Message = require("../models/messageModel");
const mongoose = require("mongoose");

class MessageController {
  // Tạo tin nhắn mới
  async createMessage(req, res) {
    try {
      const { "Nội Dung Tin Nhắn": noiDung, "Người Nhận": nguoiNhan } = req.body;
      const nguoiGui = req.user?.id;

      if (!nguoiGui) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Tìm hoặc tạo conversation
      let conversation = await Message.findOne({
        $or: [
          { "Người 1": nguoiGui, "Người 2": nguoiNhan },
          { "Người 1": nguoiNhan, "Người 2": nguoiGui }
        ]
      });

      if (!conversation) {
        conversation = new Message({
          "Người 1": nguoiGui,
          "Người 2": nguoiNhan,
          "Cuộc Trò Chuyện": {}
        });
      }

      // Thêm tin nhắn mới
      const messageId = new mongoose.Types.ObjectId().toString();
      conversation["Cuộc Trò Chuyện"].set(messageId, {
        "Nội Dung Tin Nhắn": noiDung,
        "Gửi Lúc": new Date(),
        "Người Gửi": nguoiGui
      });

      await conversation.save();

      res.status(201).json({
        success: true,
        data: conversation,
        message: "Message sent successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy tin nhắn giữa 2 người
  async getMessages(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const conversation = await Message.findOne({
        $or: [
          { "Người 1": currentUserId, "Người 2": userId },
          { "Người 1": userId, "Người 2": currentUserId }
        ]
      });

      if (!conversation) {
        return res.status(200).json({
          success: true,
          data: { "Cuộc Trò Chuyện": {} },
          message: "No conversation found"
        });
      }

      res.status(200).json({
        success: true,
        data: conversation,
        message: "Messages retrieved successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy danh sách conversations
  async getConversations(req, res) {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const conversations = await Message.find({
        $or: [
          { "Người 1": currentUserId },
          { "Người 2": currentUserId }
        ]
      }).sort({ updatedAt: -1 });

      res.status(200).json({
        success: true,
        data: conversations,
        message: "Conversations retrieved successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
}

module.exports = new MessageController();
