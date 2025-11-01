const Music = require("../models/musicModel");
const mongoose = require("mongoose");

class MusicController {
  // Tạo music mới
  async createMusic(req, res) {
    try {
      const { 
        "Chi Tiết": chiTiet,
        "HashTag": hashTag,
        "Link Mua Nhạc": linkMuaNhac,
        "Tên Bài Nhạc": tenBaiNhac,
        "Tên Nghệ Sĩ": tenNgheSi,
        "Ảnh Nền Bài Nhạc": anhNenBaiNhac
      } = req.body;
      
      const nguoiDang = req.user?.id;

      if (!nguoiDang) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const musicData = {
        "Chi Tiết": chiTiet,
        "HashTag": hashTag,
        "Link Mua Nhạc": linkMuaNhac,
        "Tên Bài Nhạc": tenBaiNhac,
        "Tên Nghệ Sĩ": tenNgheSi,
        "Ảnh Nền Bài Nhạc": anhNenBaiNhac,
        "Người Đăng": nguoiDang
      };

      const music = new Music(musicData);
      await music.save();

      res.status(201).json({
        success: true,
        data: music,
        message: "Music created successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy tất cả musics
  async getAllMusics(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const skip = (page - 1) * limit;
      
      const musics = await Music.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Music.countDocuments();
      
      res.status(200).json({
        success: true,
        data: musics,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy musics theo author
  async getMusicsByAuthor(req, res) {
    try {
      const { authorId } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      if (!authorId) {
        return res.status(400).json({
          success: false,
          message: "Author ID is required"
        });
      }

      // Build query to handle both ObjectId and UUID string
      const query = {
        $or: [
          { authorEntityId: authorId } // Try string match first
        ]
      };

      // If authorId is a valid ObjectId, also search by "Người Đăng"
      if (mongoose.Types.ObjectId.isValid(authorId)) {
        query.$or.push(
          { "Người Đăng": new mongoose.Types.ObjectId(authorId) }
        );
      }

      const skip = (page - 1) * limit;
      const musics = await Music.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Music.countDocuments(query);
      
      res.status(200).json({
        success: true,
        data: musics,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("[MUSIC] Error getting musics by author:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Thích music
  async likeMusic(req, res) {
    try {
      const { musicId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const music = await Music.findById(musicId);
      if (!music) {
        return res.status(404).json({
          success: false,
          message: "Music not found"
        });
      }

      // Kiểm tra đã thích chưa
      const existingLike = Array.from(music["Thích"].values())
        .find(like => like.toString() === userId.toString());

      if (existingLike) {
        return res.status(400).json({
          success: false,
          message: "Already liked this music"
        });
      }

      // Thêm like
      const likeId = new mongoose.Types.ObjectId().toString();
      music["Thích"].set(likeId, userId);
      await music.save();

      res.status(200).json({
        success: true,
        data: music,
        message: "Music liked successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Bỏ thích music
  async unlikeMusic(req, res) {
    try {
      const { musicId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const music = await Music.findById(musicId);
      if (!music) {
        return res.status(404).json({
          success: false,
          message: "Music not found"
        });
      }

      // Tìm và xóa like
      for (const [likeId, like] of music["Thích"].entries()) {
        if (like.toString() === userId.toString()) {
          music["Thích"].delete(likeId);
          break;
        }
      }

      await music.save();

      res.status(200).json({
        success: true,
        data: music,
        message: "Music unliked successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
}

module.exports = new MusicController();
