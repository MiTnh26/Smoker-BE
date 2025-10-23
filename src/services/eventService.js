const EventModel = require("../models/eventModel");
const { success, error } = require("../utils/response");

const EventService = {
  async getEvents(barPageId) {
    const data = await EventModel.getEventsByBarId(barPageId);
    return success("Lấy danh sách sự kiện thành công", data);
  },

  async createEvent(data) {
    if (!data.BarPageId || !data.EventName)
      return error("Thiếu thông tin sự kiện");

    const newEvent = await EventModel.createEvent(data);
    return success("Tạo sự kiện thành công", newEvent);
  },
};

module.exports = EventService;
