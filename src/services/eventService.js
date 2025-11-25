// src/services/eventService.js
const EventModel = require("../models/eventModel");
const { success, error } = require("../utils/response");
const { validate: uuidValidate } = require("uuid");

const EventService = {
  async listByBar(barPageId, query) {
    if (!barPageId || !uuidValidate(barPageId)) {
      return error("BarPageId không hợp lệ", 400);
    }
    const skip = Math.max(parseInt(query.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(parseInt(query.take ?? "20", 10), 1), 100);

    const data = await EventModel.getEventsByBarId(barPageId, { skip, take });
    return success("Lấy danh sách sự kiện thành công", data);
  },

  async getById(eventId) {
    if (!eventId || !uuidValidate(eventId)) {
      return error("EventId không hợp lệ", 400);
    }

    const item = await EventModel.getEventById(eventId);
    if (!item) return error("Không tìm thấy sự kiện", 404);

    return success("Lấy sự kiện thành công", item);
  },

  async create(payload) {
    const created = await EventModel.createEvent(payload);
    return success("Tạo sự kiện thành công", created, 201);
  },

  async update(eventId, payload) {
    const updated = await EventModel.updateEvent(eventId, payload);
    return success("Cập nhật sự kiện thành công", updated);
  },

  async remove(eventId) {
    await EventModel.deleteEvent(eventId);
    return success("Xóa sự kiện thành công", { EventId: eventId });
  },

 async getAll(reqQuery) {
    const skip = Math.max(parseInt(reqQuery.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(parseInt(reqQuery.take ?? "20", 10), 1), 100);
    const status = reqQuery.status || null;

    // Tự động cập nhật các event đã hết hạn
    await EventModel.autoUpdateEndedEvents();

    const data = await EventModel.getAllEvents({ skip, take, status });
    return success("Lấy danh sách tất cả sự kiện thành công", data);
  },

  async search(reqQuery) {
    const q = (reqQuery.q || "").trim();
    const skip = Math.max(parseInt(reqQuery.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(parseInt(reqQuery.take ?? "20", 10), 1), 50);

    if (!q || q.length < 2) {
      return error("Từ khóa tìm kiếm phải từ 2 ký tự trở lên", 400);
    }

    const data = await EventModel.searchEvents({ q, skip, take });
    return success(`Tìm thấy ${data.total} sự kiện`, data);
  },

  // ... toggleStatus cũ giữ nguyên, hoặc cải tiến thêm "ended" không cho toggle
  async toggleStatus(eventId) {
    if (!eventId || !uuidValidate(eventId)) {
      return error("EventId không hợp lệ", 400);
    }

    const exist = await EventModel.getEventById(eventId);
    if (!exist) return error("Không tìm thấy sự kiện", 404);

    // Không cho phép ẩn/hiện nếu đã ended
    if (exist.Status === "ended") {
      return error("Sự kiện đã kết thúc không thể thay đổi trạng thái hiển thị", 400);
    }

    const newStatus = exist.Status === "invisible" ? "visible" : "invisible";

    const updated = await EventModel.updateEventStatus(eventId, newStatus);

    return success("Cập nhật trạng thái thành công", {
      EventId: eventId,
      oldStatus: exist.Status,
      newStatus,
    });
  },
};

module.exports = EventService;
