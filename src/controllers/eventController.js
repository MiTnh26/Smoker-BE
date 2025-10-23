const EventService = require("../services/eventService");
const { success, error } = require("../utils/response");

const EventController = {
  async getByBar(req, res) {
    try {
      const { barPageId } = req.params;
      const result = await EventService.getEvents(barPageId);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json(error("Lỗi server"));
    }
  },

  async create(req, res) {
    try {
      const { BarPageId, EventName, Description, StartTime, EndTime } = req.body;
      const Picture = req.file?.path || null; // Cloudinary upload
      const result = await EventService.createEvent({
        BarPageId,
        EventName,
        Description,
        Picture,
        StartTime,
        EndTime,
      });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json(error("Lỗi server"));
    }
  },
};

module.exports = EventController;
