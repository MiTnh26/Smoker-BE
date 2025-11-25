// src/models/detailSchedule.js
const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    TableName: { type: String, required: true },
    Price: { type: String, required: true },
  },
  { _id: false }
);

const detailScheduleSchema = new mongoose.Schema(
  {
    // Map<BarTableId (GUID), { TableName, Price }>
    Table: {
      type: Map,
      of: tableSchema,
      default: {},
    },
    Note: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "detailSchedules",
  }
);

detailScheduleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("DetailSchedule", detailScheduleSchema, "detailSchedules");
