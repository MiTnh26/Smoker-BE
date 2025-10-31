const mongoose = require("mongoose");

// Schema cho Bàn trong Schedule
const tableSchema = new mongoose.Schema(
  {
    TableName: {
      type: String,
      required: true,
    },
    Price: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Schema cho Detail Schedule
const detailScheduleSchema = new mongoose.Schema(
  {
    Table: {
      type: Map,
      of: tableSchema,
      default: {},
    },
    Note: {
      type: String,
      required: true,
    },
    Event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "detailSchedules",
  }
);

// Schema cho Booking Schedule
const bookingScheduleSchema = new mongoose.Schema(
  {
    Address: {
      type: String,
      required: true,
    },
    BookerName: {
      type: String,
      required: true,
    },
    BookerPhone: {
      type: String,
      required: true,
    },
    Note: {
      type: String,
      required: true,
    },
    PricePerHour: {
      type: Number,
      required: true,
    },
    totalHour: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "detailSchedules",
  }
);

// Index để tối ưu hóa query
detailScheduleSchema.index({ Event: 1 });
detailScheduleSchema.index({ createdAt: -1 });

module.exports = {
  DetailSchedule: mongoose.model("DetailSchedule", detailScheduleSchema, "detailSchedules"),
  BookingSchedule: mongoose.model("BookingSchedule", bookingScheduleSchema, "detailSchedules"),
};
