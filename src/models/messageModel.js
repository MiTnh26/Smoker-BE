const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender_id: {
      type: String, // entityAccountId
      required: true,
      index: true,
    },
    sender_entity_type: {
      type: String,
      enum: ["Account", "BarPage", "BusinessAccount"],
      default: null,
    },
    content: {
      type: String,
      required: true,
    },
    message_type: {
      type: String,
      default: "text",
    },
    is_story_reply: {
      type: Boolean,
      default: false,
    },
    story_id: {
      type: String,
      default: null,
    },
    story_url: {
      type: String,
      default: null,
    },
    is_post_share: {
      type: Boolean,
      default: false,
    },
    post_id: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "messages", // Collection for individual message documents
  }
);

// Indexes for query optimization
messageSchema.index({ conversation_id: 1, createdAt: -1 }); // Composite index for pagination
messageSchema.index({ sender_id: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema, "messages");
