const mongoose = require("mongoose");

// English-field Music schema
const musicReplySchema = new mongoose.Schema(
  {
    replierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    repliedCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

const musicCommentSchema = new mongoose.Schema(
  {
    commenterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    replies: {
      type: Map,
      of: musicReplySchema,
      default: {},
    },
    images: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const musicSchema = new mongoose.Schema(
  {
    details: { type: String, required: true },
    hashTag: { type: String, required: true },
    purchaseLink: { type: String, required: true },
    audioUrl: { type: String, default: null },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    coverUrl: { type: String, required: true },
    uploaderId: { type: String, default: null }, // Backward compatibility
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
    comments: { type: Map, of: musicCommentSchema, default: {} },
    likes: { type: Map, of: mongoose.Schema.Types.ObjectId, default: {} },
    uploaderName: { type: String, default: null },
    uploaderAvatar: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: "musics",
  }
);

musicSchema.index({ uploaderId: 1 });
musicSchema.index({ createdAt: -1 });
musicSchema.index({ title: "text", artist: "text" });
musicSchema.index({ entityAccountId: 1 }); // Index cho entityAccountId
musicSchema.index({ entityType: 1, entityId: 1 }); // Composite index cho entityType và entityId

module.exports = mongoose.model("Music", musicSchema, "musics");
