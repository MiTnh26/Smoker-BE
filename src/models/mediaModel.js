const mongoose = require("mongoose");

// Schema cho Lượt Thích trong Media
const mediaLikeSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.Mixed, // Can be String or ObjectId
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

// Schema cho Lượt Trả Lời trong Media
const mediaReplySchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.Mixed, // Can be String or ObjectId
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
      of: mediaLikeSchema,
      default: {},
    },
    replyToId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    TypeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      default: function() {
        return new mongoose.Types.ObjectId();
      },
    },
  },
  { timestamps: true, _id: false }
);

// Schema cho Bình Luận trong Media
const mediaCommentSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      default: function() {
        return new mongoose.Types.ObjectId();
      },
    },
    accountId: {
      type: mongoose.Schema.Types.Mixed, // Can be String or ObjectId
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    likes: {
      type: Map,
      of: mediaLikeSchema,
      default: {},
    },
    replies: {
      type: Map,
      of: mediaReplySchema,
      default: {},
    },
    images: {
      type: String,
      default: "",
    },
    TypeRole: {
      type: String,
      enum: ["Account", "BusinessAccount", "BarPage"],
      required: true,
    },
  },
  { timestamps: true, _id: false }
);

// Schema chính cho Media
const mediaSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.Mixed, // Can be String or ObjectId (backward compatibility)
      default: null,
    },
    entityAccountId: {
      type: String, // Lưu EntityAccountId - ID của role/entity đang upload
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
    url: {
      type: String,
      required: true,
    },
  type: {
    type: String,
    enum: ["image", "video"],
    default: "image",
  },
    caption: {
      type: String,
      default: "",
    },
    comments: {
      type: Map,
      of: mediaCommentSchema,
      default: new Map(),
    },
    likes: {
      type: Map,
      of: mediaLikeSchema,
      default: new Map(),
    },
    shares: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "medias",
  }
);

// Index để tối ưu hóa query
mediaSchema.index({ postId: 1 });
mediaSchema.index({ accountId: 1 });
mediaSchema.index({ createdAt: -1 });
// Avoid duplicate medias per post for same URL
mediaSchema.index({ postId: 1, url: 1 }, { unique: false });
mediaSchema.index({ entityAccountId: 1 }); // Index cho entityAccountId
mediaSchema.index({ entityType: 1, entityId: 1 }); // Composite index cho entityType và entityId

module.exports = mongoose.model("Media", mediaSchema, "medias");

