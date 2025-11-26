const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    user_id: {
      type: String, // entityAccountId
      required: true,
      index: true,
    },
    last_read_message_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    last_read_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "participants",
  }
);

// Indexes for query optimization
participantSchema.index({ conversation_id: 1, user_id: 1 }, { unique: true }); // Composite unique index
participantSchema.index({ conversation_id: 1 });
participantSchema.index({ user_id: 1 });
participantSchema.index({ user_id: 1, last_read_at: -1 });

module.exports = mongoose.model("Participant", participantSchema, "participants");


