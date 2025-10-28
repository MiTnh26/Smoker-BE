const postService = require("../services/postService");
const storyService = require("../services/storyService");
class StoryController {
  // Lấy danh sách story (type=story, còn hạn)
  async getStories(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const result = await storyService.getStories(parseInt(page), parseInt(limit));
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
}

module.exports = new StoryController();
