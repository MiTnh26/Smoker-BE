// src/models/detailSchedule.js
const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    TableName: { type: String, required: true },
    // Luồng đặt bàn mới không còn cọc, nên không bắt buộc Price nữa
    Price: { type: String, required: false, default: "" },
  },
  { _id: false }
);

const detailScheduleSchema = new mongoose.Schema(
  {
    // Map<BarTableId (GUID), { TableName, Price? }>
    Table: {
      type: Map,
      of: tableSchema,
      default: {},
    },
    Note: {
      type: String,
      default: "",
    },
    // QR code (base64) cho booking bàn để bar scan confirm
    QRCode: {
      type: String,
      default: "",
    },
    // Combo áp dụng cho booking bàn (luồng mới)
    Combo: {
      ComboId: { type: String, default: "" },
      ComboName: { type: String, default: "" },
      Price: { type: Number, default: 0 },
    },
    // Voucher áp dụng (optional)
    Voucher: {
      VoucherId: { type: String, default: "" },
      VoucherCode: { type: String, default: "" },
      VoucherName: { type: String, default: "" },
      OriginalValue: { type: Number, default: 0 },
      SalePrice: { type: Number, default: 0 },
    },
    // Địa chỉ cho DJ/Dancer booking
    Location: {
      type: String,
      default: "",
    },
    // Số điện thoại cho DJ/Dancer booking
    Phone: {
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
    // Slots đã chọn cho DJ/Dancer booking (array of numbers: [1, 2, 3])
    Slots: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "detailSchedules",
  }
);

detailScheduleSchema.index({ createdAt: -1 });

module.exports = mongoose.model("DetailSchedule", detailScheduleSchema, "detailSchedules");
