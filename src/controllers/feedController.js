const { feedService } = require("../services");
const { success, error } = require("../utils/response");

class FeedController {
  async getFeed(req, res) {
    try {
      const { limit = 10, cursor } = req.query;
      const currentUser = req.user; // Lấy từ middleware verifyToken

      const result = await feedService.getFeed({
        currentUser,
        limit: parseInt(limit, 10),
        cursor,
      });

      return res.json(success("Feed retrieved successfully", result));
    } catch (err) {
      console.error("[FeedController] getFeed error:", err);
      return res.status(500).json(error("Failed to retrieve feed"));
    }
  }
}

module.exports = new FeedController();

