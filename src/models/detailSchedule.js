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
      default: "",
    },
    // Địa chỉ cho DJ/Dancer booking
    Location: {
      type: String,
      default: "",
    },
    // Giá đề xuất cho DJ/Dancer booking
    OfferedPrice: {
      type: Number,
      default: 0,
    },
    // Vai trò của performer (DJ/Dancer)
    PerformerRole: {
      type: String,
      default: "",
    },
    // Vai trò của người đặt (Customer/Bar)
    RequesterRole: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "detailSchedules",
  }
);

detailScheduleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("DetailSchedule", detailScheduleSchema, "detailSchedules");
