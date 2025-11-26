const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["single", "group"],
      default: "single",
      index: true,
    },
    participants: {
      type: [String], // Array of entityAccountIds
      required: true,
      index: true,
    },
    last_message_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    last_message_content: {
      type: String,
      default: "",
    },
    last_message_time: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "conversations",
  }
);

// Indexes for query optimization
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ last_message_time: -1 });
conversationSchema.index({ type: 1, updatedAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema, "conversations");
