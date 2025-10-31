const mongoose = require("mongoose");

// Schema chính cho Notification
const notificationSchema = new mongoose.Schema(
  {
    "Gửi Lúc": {
      type: Date,
      required: true,
    },
    "Loại Thông Báo": {
      type: String,
      enum: ["Confirm", "Messages", "Like", "Comment", "Follow"],
      required: true,
    },
    "Người Gửi Thông Báo": {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    "Người Nhận Thông Báo": {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    "Nội Dung": {
      type: String,
      required: true,
    },
    "Trạng Thái": {
      type: String,
      enum: ["Chưa Đọc", "Đã Đọc"],
      default: "Chưa Đọc",
    },
    "Đường dẫn": {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "notifaications", // Giữ nguyên tên collection từ JSON
  }
);

// Index để tối ưu hóa query
notificationSchema.index({ "Người Nhận Thông Báo": 1 });
notificationSchema.index({ "Trạng Thái": 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema, "notifaications");
