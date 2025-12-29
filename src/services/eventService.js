// src/services/eventService.js
const EventModel = require("../models/eventModel");
const EventFeedModel = require("../models/eventFeedModel");
const { success, error } = require("../utils/response");

// Dùng chung regex validate UUID để tránh phụ thuộc package `uuid` (ESM only)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}
// Cache for uuid module (ES Module, so we use dynamic import)
let uuidModule = null;
async function getUuidModule() {
  if (!uuidModule) {
    uuidModule = await import("uuid");
  }
  return uuidModule;
}

const EventService = {
  async listByBar(barPageId, query) {
    if (!isValidUUID(barPageId)) {
      return error("BarPageId không hợp lệ", 400);
    }
    const skip = Math.max(parseInt(query.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(parseInt(query.take ?? "20", 10), 1), 100);

    const data = await EventModel.getEventsByBarId(barPageId, { skip, take });
    return success("Lấy danh sách sự kiện thành công", data);
  },

  async getById(eventId) {
    if (!isValidUUID(eventId)) {
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

 // src/services/eventService.js → sửa hàm update

async update(eventId, payload) {
  try {
    const existingEvent = await EventModel.getEventById(eventId);
    if (!existingEvent) return error("Không tìm thấy sự kiện", 404);

    // Chỉ cập nhật những field được gửi lên
    const updateData = {};

    if (payload.EventName !== undefined) updateData.EventName = payload.EventName.trim();
    if (payload.Description !== undefined) updateData.Description = payload.Description.trim();
    if (payload.StartTime !== undefined) updateData.StartTime = new Date(payload.StartTime);
    if (payload.EndTime !== undefined) updateData.EndTime = new Date(payload.EndTime);

    // QUAN TRỌNG: chỉ cập nhật Picture nếu có gửi lên (có thể là URL mới hoặc "")
    if (payload.Picture !== undefined) {
      updateData.Picture = payload.Picture; // có thể là URL mới hoặc ""
      console.log("📸 Service: Updating Picture to:", payload.Picture);
      console.log("📸 Service: Picture length:", payload.Picture ? payload.Picture.length : 0);
    } else {
      console.log("ℹ️ Service: Picture not in payload (undefined) - keeping existing");
    }
    
    console.log("📋 Service: updateData keys:", Object.keys(updateData));
    console.log("📋 Service: updateData.Picture:", updateData.Picture);

    // Validate date...
    if (updateData.StartTime && updateData.EndTime && updateData.StartTime >= updateData.EndTime) {
      return error("Thời gian kết thúc phải sau thời gian bắt đầu", 400);
    }

    const updated = await EventModel.updateEvent(eventId, updateData);
    if (!updated) return error("Cập nhật thất bại", 500);

    return success("Cập nhật thành công", updated);
  } catch (err) {
    console.error(err);
    return error("Lỗi server: " + err.message, 500);
  }
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

  async toggleStatus(eventId) {
    if (!isValidUUID(eventId)) {
      return error("EventId không hợp lệ", 400);
    }

  const exist = await EventModel.getEventById(eventId);
  if (!exist) return error("Không tìm thấy sự kiện", 404);

  // Không cho toggle nếu đã Ended
  if (exist.Status === "Ended") {
    return error("Sự kiện đã kết thúc không thể thay đổi trạng thái hiển thị", 400);
  }

  // ĐỔI TỪ visible/invisible → Active/Hidden
  const newStatus = exist.Status === "active" ? "hidden" : "active";

  const updated = await EventModel.updateEventStatus(eventId, newStatus);

  return success("Thay đổi trạng thái thành công", {
    EventId: eventId,
    Status: newStatus  // frontend chỉ cần biết Status mới
  });
},

  async getBarsWithNewEvents(reqQuery) {
    const hoursFromNow = Number.parseInt(reqQuery.hours || "168", 10); // Mặc định 7 ngày
    const skip = Math.max(Number.parseInt(reqQuery.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(Number.parseInt(reqQuery.take ?? "20", 10), 1), 100);

    const [items, total] = await Promise.all([
      EventFeedModel.getBarsWithNewEvents({ hoursFromNow, skip, take }),
      EventFeedModel.getBarsWithNewEventsCount({ hoursFromNow })
    ]);

    return success("Lấy danh sách bars có events mới thành công", {
      total,
      items: items.map(bar => ({
        barPageId: String(bar.BarPageId),
        accountId: bar.AccountId ? String(bar.AccountId) : null,
        barName: bar.BarName,
        avatar: bar.Avatar,
        background: bar.Background,
        address: bar.Address,
        phoneNumber: bar.PhoneNumber,
        email: bar.Email,
        role: bar.Role,
        status: bar.Status,
        createdAt: bar.created_at,
        entityAccountId: bar.EntityAccountId ? String(bar.EntityAccountId) : null,
        reviewCount: bar.ReviewCount || 0,
        averageRating: bar.AverageRating != null ? Number(bar.AverageRating.toFixed(1)) : null,
        eventCount: bar.EventCount || 0,
        latestEventStartTime: bar.LatestEventStartTime,
        nearestEventStartTime: bar.NearestEventStartTime
      }))
    });
  },

  async getEventsWithBarRating(reqQuery) {
    const hoursFromNow = Number.parseInt(reqQuery.hours || "168", 10); // Mặc định 7 ngày
    const skip = Math.max(Number.parseInt(reqQuery.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(Number.parseInt(reqQuery.take ?? "20", 10), 1), 100);

    const [items, total] = await Promise.all([
      EventFeedModel.getEventsWithBarRating({ hoursFromNow, skip, take }),
      EventFeedModel.getEventsWithBarRatingCount({ hoursFromNow })
    ]);

    return success("Lấy danh sách events với bar rating thành công", {
      total,
      items: items.map(event => ({
        eventId: String(event.EventId),
        barPageId: String(event.BarPageId),
        eventName: event.EventName,
        description: event.Description,
        picture: event.Picture,
        startTime: event.StartTime,
        endTime: event.EndTime,
        status: event.Status,
        createdAt: event.CreatedAt,
        updatedAt: event.UpdatedAt,
        bar: {
          barPageId: String(event.BarPageId),
          barName: event.BarName,
          avatar: event.BarAvatar,
          background: event.BarBackground,
          address: event.BarAddress,
          phoneNumber: event.BarPhone,
          email: event.BarEmail,
          role: event.BarRole,
          entityAccountId: event.EntityAccountId ? String(event.EntityAccountId) : null,
          reviewCount: event.BarReviewCount || 0,
          averageRating: event.BarAverageRating != null ? Number(event.BarAverageRating.toFixed(1)) : null
        }
      }))
    });
  },

  async getOngoingAndUpcomingEvents(reqQuery) {
    const hoursFromNow = Number.parseInt(reqQuery.hours || "168", 10); // Mặc định 7 ngày
    const skip = Math.max(Number.parseInt(reqQuery.skip ?? "0", 10), 0);
    const take = Math.min(Math.max(Number.parseInt(reqQuery.take ?? "20", 10), 1), 100);

    const [items, total] = await Promise.all([
      EventFeedModel.getOngoingAndUpcomingEvents({ hoursFromNow, skip, take }),
      EventFeedModel.getOngoingAndUpcomingEventsCount({ hoursFromNow })
    ]);

    return success("Lấy danh sách events đang và sắp diễn ra thành công", {
      total,
      items: items.map(event => ({
        eventId: String(event.EventId),
        barPageId: String(event.BarPageId),
        eventName: event.EventName,
        description: event.Description,
        picture: event.Picture,
        startTime: event.StartTime,
        endTime: event.EndTime,
        status: event.Status,
        eventStatus: event.EventStatus, // 'ongoing' hoặc 'upcoming'
        createdAt: event.CreatedAt,
        updatedAt: event.UpdatedAt,
        bar: {
          barPageId: String(event.BarPageId),
          barName: event.BarName,
          avatar: event.BarAvatar,
          background: event.BarBackground,
          address: event.BarAddress,
          phoneNumber: event.BarPhone,
          email: event.BarEmail,
          role: event.BarRole,
          entityAccountId: event.EntityAccountId ? String(event.EntityAccountId) : null,
          reviewCount: event.BarReviewCount || 0,
          averageRating: event.BarAverageRating != null ? Number(event.BarAverageRating.toFixed(1)) : null
        }
      }))
    });
  }
};

module.exports = EventService;