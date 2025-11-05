const Notification = require("../models/notificationModel");
const mongoose = require("mongoose");

class NotificationController {
  // Create new notification
  async createNotification(req, res) {
    try {
      const { type, receiver, content, link } = req.body;
      
      const sender = req.user?.id;

      if (!sender) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const notificationData = {
        type,
        sender,
        receiver,
        content,
        status: "Unread",
        link
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

  // Get user notifications
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
        receiver: userId
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      const total = await Notification.countDocuments({
        receiver: userId
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

  // Mark notification as read
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
          receiver: userId
        },
        { status: "Read" },
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

  // Mark all notifications as read
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
          receiver: userId,
          status: "Unread"
        },
        { status: "Read" }
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

  // Get unread notification count
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
        receiver: queryUserId,
        status: "Unread"
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

  // Create test notification (for testing purposes)
  async createTestNotification(req, res) {
    try {
      const userId = req.user?.id;
      const { type } = req.body; // Like, Comment, Follow, Messages, Confirm

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Sample notification data based on type
      const testNotifications = {
        Like: {
          type: "Like",
          sender: userId, // Using same user as sender for test
          receiver: userId,
          content: "John Doe liked your post",
          link: "/posts/123",
          status: "Unread"
        },
        Comment: {
          type: "Comment",
          sender: userId,
          receiver: userId,
          content: "Jane Smith commented: 'Great post! Looking forward to more...'",
          link: "/posts/123",
          status: "Unread"
        },
        Follow: {
          type: "Follow",
          sender: userId,
          receiver: userId,
          content: "Mike Johnson started following you",
          link: "/profile/mike-johnson",
          status: "Unread"
        },
        Messages: {
          type: "Messages",
          sender: userId,
          receiver: userId,
          content: "Sarah Wilson: 'Hey! Are you free this weekend?'",
          link: "/messages/sarah-wilson",
          status: "Unread"
        },
        Confirm: {
          type: "Confirm",
          sender: userId,
          receiver: userId,
          content: "Your table booking has been confirmed",
          link: "/bookings/456",
          status: "Unread"
        }
      };

      const notificationData = testNotifications[type] || testNotifications.Like;
      
      const notification = new Notification(notificationData);
      await notification.save();

      res.status(201).json({
        success: true,
        data: notification,
        message: `Test ${type} notification created successfully`
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

module.exports = new NotificationController();
