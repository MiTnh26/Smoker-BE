// src/services/bookingTableService.js
const bookedScheduleModel = require("../models/bookedScheduleModel");
const DetailSchedule = require("../models/detailSchedule");
const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");

class BookingTableService {
  // Tạo booking bàn trong bar
  async createBarTableBooking({
    bookerAccountId,  // AccountId lấy từ token
    receiverEntityId, // EntityAccountId của bar (FE gửi)
    tables,
    note,
    totalAmount,
    bookingDate,
    startTime,
    endTime,
  }) {
    if (!bookerAccountId || !receiverEntityId) {
      return { success: false, message: "Thiếu bookerAccountId hoặc receiverEntityId" };
    }

    if (!Array.isArray(tables) || tables.length === 0) {
      return { success: false, message: "Danh sách bàn không được để trống" };
    }

    // Map AccountId → EntityAccountId cho người đặt
    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
    }

    try {
      // 1. Lưu chi tiết bàn vào Mongo
      const tableMap = {};
      for (const t of tables) {
        if (!t.id || !t.tableName || t.price == null) continue;
        tableMap[t.id] = {
          TableName: t.tableName,
          Price: String(t.price),
        };
      }

      const detailDoc = await DetailSchedule.create({
        Table: tableMap,
        Note: note || "",
      });

      // 2. Lưu booking tổng vào SQL (BookerId & ReceiverId đều là EntityAccountId)
      const createdBooking = await bookedScheduleModel.createBookedSchedule({
        bookerId: bookerEntityId,
        receiverId: receiverEntityId,
        type: "BarTable",
        totalAmount: totalAmount || 0,
        paymentStatus: "Pending",
        scheduleStatus: "Pending",
        bookingDate,
        startTime,
        endTime,
        mongoDetailId: detailDoc._id.toString(),
      });

      return {
        success: true,
        message: "Đặt bàn thành công",
        data: {
          ...createdBooking,
          detailSchedule: detailDoc,
        },
      };
    } catch (error) {
      console.error("createBarTableBooking error:", error);
      return {
        success: false,
        message: error.message || "Lỗi khi tạo booking bàn",
      };
    }
  }

  async confirmBooking(bookedScheduleId, receiverAccountId) {
    const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);
    if (!schedule) {
      return { success: false, message: "Không tìm thấy booking" };
    }

    // Map account của bar → EntityAccountId rồi so sánh
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId || schedule.ReceiverId.toLowerCase() !== receiverEntityId.toLowerCase()) {
      return { success: false, message: "Bạn không có quyền xác nhận booking này" };
    }

    const updated = await bookedScheduleModel.updateBookedScheduleStatuses(bookedScheduleId, {
      scheduleStatus: "Confirmed",
    });

    return {
      success: true,
      message: "Xác nhận booking thành công",
      data: updated,
    };
  }

  async cancelBooking(bookedScheduleId, bookerAccountId) {
    const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);
    if (!schedule) {
      return { success: false, message: "Không tìm thấy booking" };
    }

    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId || schedule.BookerId.toLowerCase() !== bookerEntityId.toLowerCase()) {
      return { success: false, message: "Bạn không có quyền huỷ booking này" };
    }

    if (schedule.ScheduleStatus !== "Pending") {
      return { success: false, message: "Chỉ được huỷ booking đang ở trạng thái Pending" };
    }

    const updated = await bookedScheduleModel.updateBookedScheduleStatuses(bookedScheduleId, {
      scheduleStatus: "Canceled",
    });

    return {
      success: true,
      message: "Huỷ booking thành công",
      data: updated,
    };
  }

  async getByBooker(bookerAccountId, { limit = 50, offset = 0 } = {}) {
    const bookerEntityId = await getEntityAccountIdByAccountId(bookerAccountId, "Account");
    if (!bookerEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho người đặt" };
    }

    const data = await bookedScheduleModel.getBookedSchedulesByBooker(bookerEntityId, { limit, offset });
    return { success: true, data };
  }

  async getByReceiver(receiverAccountId, { limit = 50, offset = 0 } = {}) {
    const receiverEntityId = await getEntityAccountIdByAccountId(receiverAccountId, "BarPage");
    if (!receiverEntityId) {
      return { success: false, message: "Không tìm thấy EntityAccount cho bar" };
    }

    const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverEntityId, { limit, offset });
    return { success: true, data };
  }
}

module.exports = new BookingTableService();
