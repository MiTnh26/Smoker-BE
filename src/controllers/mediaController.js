const Media = require("../models/mediaModel");
const mongoose = require("mongoose");

class MediaController {
  // Lấy chi tiết media theo ID
  async getMediaById(req, res) {
    try {
      const { mediaId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);

      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Convert Map to Object for JSON response
      const mediaData = media.toObject();
      
      // Convert comments Map to Object
      if (mediaData.comments instanceof Map) {
        mediaData.comments = Object.fromEntries(mediaData.comments);
      }
      
      // Convert likes Map to Object
      if (mediaData.likes instanceof Map) {
        mediaData.likes = Object.fromEntries(mediaData.likes);
      }

      // Convert nested Maps in comments (likes, replies)
      if (mediaData.comments && typeof mediaData.comments === 'object') {
        Object.keys(mediaData.comments).forEach(key => {
          const comment = mediaData.comments[key];
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          }
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            // Convert likes in replies too
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              }
            });
          }
        });
      }

      return res.json({
        success: true,
        data: mediaData
      });
    } catch (error) {
      console.error("[MEDIA] Error getting media by ID:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media",
        error: error.message
      });
    }
  }

  // Lấy media theo postId và URL
  async getMediaByUrl(req, res) {
    try {
      const { postId, url } = req.query;

      // url là bắt buộc, postId là tuỳ chọn
      if (!url) {
        return res.status(400).json({
          success: false,
          message: "url is required"
        });
      }

      let query = { url };
      // Nếu có postId hợp lệ thì lọc theo postId, nếu không thì tìm theo url duy nhất
      if (postId && mongoose.Types.ObjectId.isValid(postId)) {
        query.postId = new mongoose.Types.ObjectId(postId);
      }

      // Find media by (postId?) and url
      const media = await Media.findOne(query);

      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Convert Map to Object for JSON response
      const mediaData = media.toObject();
      
      // Convert comments Map to Object
      if (mediaData.comments instanceof Map) {
        mediaData.comments = Object.fromEntries(mediaData.comments);
      }
      
      // Convert likes Map to Object
      if (mediaData.likes instanceof Map) {
        mediaData.likes = Object.fromEntries(mediaData.likes);
      }

      // Convert nested Maps in comments (likes, replies)
      if (mediaData.comments && typeof mediaData.comments === 'object') {
        Object.keys(mediaData.comments).forEach(key => {
          const comment = mediaData.comments[key];
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          }
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            // Convert likes in replies too
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              }
            });
          }
        });
      }

      return res.json({
        success: true,
        data: mediaData
      });
    } catch (error) {
      console.error("[MEDIA] Error getting media by URL:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media",
        error: error.message
      });
    }
  }
}

module.exports = new MediaController();

