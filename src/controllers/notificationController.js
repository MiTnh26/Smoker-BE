const Notification = require("../models/notificationModel");
const mongoose = require("mongoose");

class NotificationController {
  // Tạo thông báo mới
  async createNotification(req, res) {
    try {
      const {
        "Loại Thông Báo": loaiThongBao,
        "Người Nhận Thông Báo": nguoiNhan,
        "Nội Dung": noiDung,
        "Đường dẫn": duongDan
      } = req.body;
      
      const nguoiGui = req.user?.id;

      if (!nguoiGui) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const notificationData = {
        "Gửi Lúc": new Date(),
        "Loại Thông Báo": loaiThongBao,
        "Người Gửi Thông Báo": nguoiGui,
        "Người Nhận Thông Báo": nguoiNhan,
        "Nội Dung": noiDung,
        "Trạng Thái": "Chưa Đọc",
        "Đường dẫn": duongDan
      };

      const notification = new Notification(notificationData);
      await notification.save();

      res.status(201).json({
        success: true,
        data: notification,
        message: "Notification created successfully"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy thông báo của user
  async getNotifications(req, res) {
    try {
      const userId = req.user?.id;
      const { page = 1, limit = 10 } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const skip = (page - 1) * limit;
      
      const notifications = await Notification.find({
        "Người Nhận Thông Báo": userId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Notification.countDocuments({
        "Người Nhận Thông Báo": userId
      });

      res.status(200).json({
        success: true,
        data: notifications,
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

  // Đánh dấu thông báo đã đọc
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const notification = await Notification.findOneAndUpdate(
        {
          _id: notificationId,
          "Người Nhận Thông Báo": userId
        },
        { "Trạng Thái": "Đã Đọc" },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found"
        });
      }

      res.status(200).json({
        success: true,
        data: notification,
        message: "Notification marked as read"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Đánh dấu tất cả thông báo đã đọc
  async markAllAsRead(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      await Notification.updateMany(
        {
          "Người Nhận Thông Báo": userId,
          "Trạng Thái": "Chưa Đọc"
        },
        { "Trạng Thái": "Đã Đọc" }
      );

      res.status(200).json({
        success: true,
        message: "All notifications marked as read"
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Lấy số lượng thông báo chưa đọc
  async getUnreadCount(req, res) {
    try {
      console.log("📊 getUnreadCount - Request user:", req.user);
      const userId = req.user?.id;

      if (!userId) {
        console.log("❌ No userId found in request");
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user ID"
        });
      }

      console.log("📊 Querying unread count for userId:", userId, "Type:", typeof userId);
      
      // Try both string and ObjectId formats
      let queryUserId = userId;
      if (typeof userId === 'string' && userId.length === 36) {
        // It's a UUID string, keep it as string
        queryUserId = userId;
      }
      
      const count = await Notification.countDocuments({
        "Người Nhận Thông Báo": queryUserId,
        "Trạng Thái": "Chưa Đọc"
      });

      console.log("✅ Unread count:", count);
      res.status(200).json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error("❌ Error in getUnreadCount:", error);
      console.error("❌ Error stack:", error.stack);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
}

module.exports = new NotificationController();
