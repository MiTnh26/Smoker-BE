const EventModel = require("../models/eventModel");

async function updateEndedEventsJob() {
  try {
    await EventModel.autoUpdateEndedEvents();
    console.log("Đã cập nhật trạng thái các event đã kết thúc");
  } catch (err) {
    console.error("Lỗi job update ended events:", err);
  }
}

module.exports = updateEndedEventsJob;