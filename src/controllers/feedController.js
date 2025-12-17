const { feedService } = require("../services");
const { success, error } = require("../utils/response");

class FeedController {
  async getFeed(req, res) {
    try {
      const { limit = 10, cursor, entityAccountId } = req.query;
      const currentUser = req.user; // Lấy từ middleware verifyToken
      
      // Ưu tiên entityAccountId từ query param (FE gửi) để biết role hiện tại đang dùng
      // Nếu không có thì dùng từ req.user (có thể là role cũ trong JWT)
      if (entityAccountId && currentUser) {
        currentUser.entityAccountId = entityAccountId;
      }

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

