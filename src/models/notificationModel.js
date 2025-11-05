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
      type: String, // UUID from SQL Server
      required: true,
    },
    receiver: {
      type: String, // UUID from SQL Server
      required: true,
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

module.exports = mongoose.model("Notification", notificationSchema, "notifaications");
