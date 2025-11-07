const mongoose = require("mongoose");

// Schema cho Tin Nhắn trong Cuộc Trò Chuyện
const messageSchema = new mongoose.Schema(
  {
    "Nội Dung Tin Nhắn": {
      type: String,
      required: true,
    },
    "Gửi Lúc": {
      type: Date,
      required: true,
    },
    "Người Gửi": {
      type: String, // UUID hoặc ObjectId đều được, miễn đồng bộ với userId
      required: true,
    },
    "Đã Đọc": {
      type: Boolean,
      default: false
    },
  },
  { timestamps: true }
);

// Schema chính cho Message
const messageModelSchema = new mongoose.Schema(
  {
    "Cuộc Trò Chuyện": {
      type: Map,
      of: messageSchema,
      default: {},
    },
    "Người 1": {
      type: String, // UUID hoặc ObjectId đều được, miễn đồng bộ với userId
      required: true,
    },
    "Người 2": {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "messages",
  }
);

// Index để tối ưu hóa query
messageModelSchema.index({ "Người 1": 1, "Người 2": 1 });
messageModelSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Message", messageModelSchema, "messages");
