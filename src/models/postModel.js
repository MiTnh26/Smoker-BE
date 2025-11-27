const mongoose = require("mongoose");

// Schema cho Lượt Thích
const likeSchema = new mongoose.Schema(
  {
    accountId: {
      type: String, // ID từ SQL Server
      required: true,
    },
    entityAccountId: {
      type: String, // EntityAccountId của người tương tác
      default: null,
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
      type: String, // ID từ SQL Server (backward compatibility)
      required: true,
    },
    entityAccountId: {
      type: String, // EntityAccountId của người reply
      default: null,
    },
    entityId: {
      type: String, // EntityId của người reply
      default: null,
    },
    entityType: {
      type: String, // EntityType của người reply
      enum: ["Account", "BusinessAccount", "BarPage"],
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
      type: String, // ID từ SQL Server (backward compatibility)
      required: true,
    },
    entityAccountId: {
      type: String, // EntityAccountId của người comment
      default: null,
    },
    entityId: {
      type: String, // EntityId của người comment
      default: null,
    },
    entityType: {
      type: String, // EntityType của người comment
      enum: ["Account", "BusinessAccount", "BarPage"],
      default: null,
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
      required: false, // Cho phép rỗng (đặc biệt cho repost không có comment)
      default: "",
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
      type: String, // Lưu AccountId (backward compatibility)
      default: null,
    },
    entityAccountId: {
      type: String, // Lưu EntityAccountId - ID của role/entity đang post
      required: true,
      index: true,
    },
    entityId: {
      type: String, // Lưu EntityId - ID của entity cụ thể (AccountId, BarPageId, BusinessAccountId)
      default: null,
      index: true,
    },
    entityType: {
      type: String, // Lưu EntityType - Loại entity: "Account", "BarPage", "BusinessAccount"
      enum: ["Account", "BarPage", "BusinessAccount"],
      default: null,
      index: true,
    },
    barId: {
      type: String, // ID của bar (nếu là bài của bar)
      default: null,
    },
    content: {
      type: String,
      required: false, // Story được phép không có content (empty string)
      default: "",
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
    musicId: {
      type: mongoose.Schema.Types.ObjectId,
       ref: "Music", 
       default: null 
      },
    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      default: null,
    },
    mediaIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media',
      }
    ],
    trendingScore: {
      type: Number,
      default: 0,
      index: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
    repostedFromId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post", // Reference đến post gốc (không phân biệt post hay media, query sẽ tự xử lý)
      default: null,
      index: true,
    },
    // Không lưu snapshot - chỉ cần repostedFromId, query lại khi hiển thị
    status: {
      type: String,
      enum: ["public", "private", "trashed", "deleted"], // public: công khai, private: riêng tư, trashed: đã trash (ẩn), deleted: đã xóa vĩnh viễn
      default: "public",
      index: true,
    },
    trashedAt: {
      type: Date, // Thời gian post bị trash, null nếu chưa trash
      default: null,
      index: true,
    },
    trashedBy: {
      type: String, // EntityAccountId của người trash
      default: null,
    },
    audioDuration: {
      type: Number, // Độ dài đoạn nhạc đã cắt (giây) - chỉ dùng cho story có audio
      default: null,
    },
    audioStartOffset: {
      type: Number, // Thời điểm bắt đầu cắt nhạc (giây) - chỉ dùng cho story có audio
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
postSchema.index({ mediaIds: 1 });
postSchema.index({ trendingScore: -1 }); // Index cho trending score để sort nhanh
postSchema.index({ entityAccountId: 1 }); // Index cho entityAccountId
postSchema.index({ entityType: 1, entityId: 1 }); // Composite index cho entityType và entityId
// Composite index để tối ưu sort order: trendingScore DESC, createdAt DESC (ưu tiên trendingScore)
postSchema.index({ trendingScore: -1, createdAt: -1 });

module.exports = mongoose.model("Post", postSchema, "posts");