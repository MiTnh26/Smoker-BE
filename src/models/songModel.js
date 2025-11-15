const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description:{
    type: String,
    required: false,
    default: "",
    trim: true,
  },
  artistName: {
    type: String,
    required: true,
    trim: true,
  },
  album: {
    type: String,
    required: false,
    default: "",
    trim: true,
  },
  song: {
    type: String,
    required: false,
    trim: true,
  },
  file: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    ref: 'uploads.files',
  },
  accountId: {
    type: String, // Backward compatibility
    default: null,
  },
  entityAccountId: {
    type: String, // Lưu EntityAccountId - ID của role/entity đang upload
    default: null,
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
  audioStartOffset: {
    type: Number, // Thời điểm bắt đầu cắt nhạc (giây)
    default: 0,
  },
  audioDuration: {
    type: Number, // Độ dài đoạn nhạc đã cắt (giây) - tối đa 30s
    default: null,
  },
}, {
  timestamps: true,
  collection: "songs"
});

songSchema.index({ entityAccountId: 1 }); // Index cho entityAccountId
songSchema.index({ entityType: 1, entityId: 1 }); // Composite index cho entityType và entityId

module.exports = mongoose.model("Song", songSchema, "songs");
 