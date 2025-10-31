const mongoose = require("mongoose");

// Schema cho Lượt Thích (theo photos.json)
const likeSchema = new mongoose.Schema(
  {
    "id người thích": {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    TypeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { _id: false }
);

// Schema cho Lượt Trả Lời (theo photos.json)
const replySchema = new mongoose.Schema(
  {
    "Người Trả Lời": {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    "Nội Dung": {
      type: String,
      required: true,
    },
    "Ảnh": {
      type: String,
      default: "",
    },
    "Lượt Thích": {
      type: Map,
      of: new mongoose.Schema({
        "id của người thích": {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        TypeRole: {
          type: String,
          enum: ["Account", "BusinessAccount", "BarPage"],
          required: true,
        },
      }, { _id: false }),
      default: {},
    },
    "Bình Luận Được Trả Lời": {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    TypeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { timestamps: true }
);

// Schema cho Bình Luận (theo photos.json)
const commentSchema = new mongoose.Schema(
  {
    "Người Bình Luận": {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    "Nội Dung": {
      type: String,
      required: true,
    },
    "Lượt Thích": {
      type: Map,
      of: new mongoose.Schema({
        "id người thích": {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        TypeRole: {
          type: String,
          enum: ["Account", "BusinessAccount", "BarPage"],
          required: true,
        },
      }, { _id: false }),
      default: {},
    },
    "Lượt Trả Lời": {
      type: Map,
      of: replySchema,
      default: {},
    },
    "Ảnh": {
      type: String,
      default: "",
    },
    TypeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { timestamps: true }
);

// Schema cho Ảnh (theo photos.json)
const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    caption: {
      type: String,
      default: "",
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Schema chính cho Post (theo photos.json)
const postSchema = new mongoose.Schema(
  {
    "Tiêu Đề": {
      type: String,
      required: true,
    },
    "Bình Luận": {
      type: Map,
      of: commentSchema,
      default: new Map(),
    },
    "Thích": {
      type: Map,
      of: new mongoose.Schema({
        "id người thích": {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        TypeRole: {
          type: String,
          enum: ["Account", "BusinessAccount", "BarPage"],
          required: true,
        },
      }, { _id: false }),
      default: new Map(),
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Thêm accountId để tương thích với service
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    caption: {
      type: String,
      required: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    url: {
      type: String,
      required: false,
      default: "default-post.jpg",
    },
    // Thêm các field mới cho media
    images: {
      type: Map,
      of: imageSchema,
      default: new Map(),
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
    // Thêm các field alias để tương thích với service
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    comments: {
      type: Map,
      of: commentSchema,
      default: new Map(),
    },
    likes: {
      type: Map,
      of: new mongoose.Schema({
        accountId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        TypeRole: {
          type: String,
          enum: ["Account", "BusinessAccount", "BarPage"],
          required: true,
        },
      }, { _id: false }),
      default: new Map(),
    },
  },
  {
    timestamps: true,
    collection: "posts", // Đổi tên collection theo JSON
  }
);

// Index để tối ưu hóa query
postSchema.index({ authorId: 1 });
postSchema.index({ accountId: 1 });
postSchema.index({ authorEntityId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ "Tiêu Đề": "text", caption: "text" });

module.exports = mongoose.model("Post", postSchema, "posts");
