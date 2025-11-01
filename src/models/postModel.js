const mongoose = require("mongoose");

// Schema cho Lượt Thích
const likeSchema = new mongoose.Schema(
  {
    accountId: {
      type: String, // ID từ SQL Server
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

// Schema cho Lượt Trả Lời
const replySchema = new mongoose.Schema(
  {
    accountId: {
      type: String, // ID từ SQL Server
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    images: {
      type: String,
      default: "",
    },
    likes: {
      type: Map,
      of: likeSchema,
      default: {},
    },
    replyToId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true, // ID của comment hoặc reply mà reply này đang reply
    },
    typeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { timestamps: true }
);

// Schema cho Bình Luận
const commentSchema = new mongoose.Schema(
  {
    accountId: {
      type: String, // ID từ SQL Server
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    likes: {
      type: Map,
      of: likeSchema,
      default: {},
    },
    replies: {
      type: Map,
      of: replySchema,
      default: {},
    },
    images: {
      type: String,
      default: "",
    },
    typeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { timestamps: true }
);

// Schema cho Ảnh
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

// Schema chính cho Post
const postSchema = new mongoose.Schema(
  {
    title: {
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
      of: likeSchema,
      default: new Map(),
    },
    accountId: {
      type: String, // Lưu ID từ SQL Server dưới dạng string
      required: true,
    },
    barId: {
      type: String, // ID của bar (nếu là bài của bar)
      default: null,
    },
    content: {
      type: String,
      required: true,
    },
    images: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["post", "story"], // post: news feed, story: story
      default: "post",
    },
    expiredAt: {
      type: Date, // chỉ dùng cho story
      default: null,
    },
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "posts", // Tên collection trong MongoDB
  }
);

// Index để tối ưu hóa query
postSchema.index({ authorId: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ title: "text", content: "text" });

module.exports = mongoose.model("Post", postSchema, "posts");