const mongoose = require("mongoose");

// Schema cho Event Advertisement - tự động xóa sau 30 ngày
const eventAdvertisementSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    eventTitle: {
      type: String,
      required: true,
    },
    eventDescription: {
      type: String,
      default: "",
    },
    barId: {
      type: String,
      required: true,
      index: true,
    },
    barName: {
      type: String,
      required: true,
    },
    pictureEvent: {
      type: String,
      default: "",
    },
    eventUrl: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index - tự động xóa sau expiresAt
    },
  },
  {
    timestamps: true,
    collection: "eventAdvertisements",
  }
);

// Tạo index cho TTL
eventAdvertisementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EventAdvertisement = mongoose.model("EventAdvertisement", eventAdvertisementSchema);

module.exports = EventAdvertisement;

