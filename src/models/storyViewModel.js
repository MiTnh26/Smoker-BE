const mongoose = require("mongoose");

// Schema cho Story View - lưu thông tin ai đã xem story nào
const storyViewSchema = new mongoose.Schema(
  {
    storyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    viewerEntityAccountId: {
      type: String,
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Compound index để tránh duplicate views và tăng tốc query
storyViewSchema.index({ storyId: 1, viewerEntityAccountId: 1 }, { unique: true });

// Index để query nhanh theo viewerEntityAccountId
storyViewSchema.index({ viewerEntityAccountId: 1, viewedAt: -1 });

const StoryView = mongoose.model("StoryView", storyViewSchema);

module.exports = StoryView;

