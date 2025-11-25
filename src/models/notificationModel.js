const mongoose = require("mongoose");

// Main Notification Schema
const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Confirm", "Messages", "Like", "Comment", "Follow"],
      required: true,
    },
    sender: {
      type: String, // UUID from SQL Server (backward compatibility - AccountId)
      default: null,
    },
    senderEntityAccountId: {
      type: String, // EntityAccountId của người gửi
      required: true,
      index: true,
    },
    senderEntityId: {
      type: String, // EntityId của người gửi
      default: null,
      index: true,
    },
    senderEntityType: {
      type: String, // EntityType của người gửi
      enum: ["Account", "BarPage", "BusinessAccount"],
      default: null,
      index: true,
    },
    receiver: {
      type: String, // UUID from SQL Server (backward compatibility - AccountId)
      default: null,
    },
    receiverEntityAccountId: {
      type: String, // EntityAccountId của người nhận
      required: true,
      index: true,
    },
    receiverEntityId: {
      type: String, // EntityId của người nhận
      default: null,
      index: true,
    },
    receiverEntityType: {
      type: String, // EntityType của người nhận
      enum: ["Account", "BarPage", "BusinessAccount"],
      default: null,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Unread", "Read"],
      default: "Unread",
    },
    link: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "notifaications", // Keep original collection name from JSON
  }
);

// Indexes for query optimization
notificationSchema.index({ receiver: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ receiverEntityAccountId: 1 }); // Index cho receiverEntityAccountId
notificationSchema.index({ senderEntityAccountId: 1 }); // Index cho senderEntityAccountId
notificationSchema.index({ receiverEntityType: 1, receiverEntityId: 1 }); // Composite index
notificationSchema.index({ senderEntityType: 1, senderEntityId: 1 }); // Composite index

module.exports = mongoose.model("Notification", notificationSchema, "notifications");
