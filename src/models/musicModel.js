const mongoose = require("mongoose");

// Lượt thích lưu dưới dạng Map<ObjectId>

// Schema cho Trả Lời Bình Luận trong Music
const musicReplySchema = new mongoose.Schema(
  {
    "Người Trả Lời": {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    "Nội Dung Trả Lời": {
      type: String,
      required: true,
    },
    "id Bình Luận Được Trả Lời": {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

// Schema cho Bình Luận trong Music
const musicCommentSchema = new mongoose.Schema(
  {
    "Người Bình Luận": {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    "Nội Dung": {
      type: String,
      required: true,
    },
    "Trả Lời Bình Luận": {
      type: Map,
      of: musicReplySchema,
      default: {},
    },
    "Ảnh": {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Schema chính cho Music
const musicSchema = new mongoose.Schema(
  {
    "Chi Tiết": {
      type: String,
      required: true,
    },
    "HashTag": {
      type: String,
      required: true,
    },
    "Link Mua Nhạc": {
      type: String,
      required: true,
    },
    "Tên Bài Nhạc": {
      type: String,
      required: true,
    },
    "Tên Nghệ Sĩ": {
      type: String,
      required: true,
    },
    "Ảnh Nền Bài Nhạc": {
      type: String,
      required: true,
    },
    "Người Đăng": {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    "Bình Luận": {
      type: Map,
      of: musicCommentSchema,
      default: {},
    },
    "Thích": {
      type: Map,
      of: mongoose.Schema.Types.ObjectId,
      default: {},
    },
    // Store entity info for display
    authorEntityId: {
      type: String,
      default: null,
    },
    authorEntityType: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      default: "Account",
    },
    authorEntityName: {
      type: String,
      default: null,
    },
    authorEntityAvatar: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "musics",
  }
);

// Index để tối ưu hóa query
musicSchema.index({ "Người Đăng": 1 });
musicSchema.index({ authorEntityId: 1 });
musicSchema.index({ createdAt: -1 });
musicSchema.index({ "Tên Bài Nhạc": "text", "Tên Nghệ Sĩ": "text" });

module.exports = mongoose.model("Music", musicSchema, "musics");
