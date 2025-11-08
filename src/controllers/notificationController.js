const Notification = require("../models/notificationModel");
const mongoose = require("mongoose");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");

class NotificationController {
  // Create new notification
  async createNotification(req, res) {
    try {
      const { 
        type, 
        receiver, 
        receiverEntityAccountId,
        receiverEntityId,
        receiverEntityType,
        content, 
        link 
      } = req.body;
      
      const sender = req.user?.id; // AccountId
      const senderEntityAccountId = req.body.senderEntityAccountId;
      const senderEntityId = req.body.senderEntityId;
      const senderEntityType = req.body.senderEntityType;

      if (!sender) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // Lấy senderEntityAccountId nếu chưa có
      let finalSenderEntityAccountId = senderEntityAccountId;
      let finalSenderEntityId = senderEntityId;
      let finalSenderEntityType = senderEntityType;

      if (!finalSenderEntityAccountId) {
        try {
          finalSenderEntityAccountId = await getEntityAccountIdByAccountId(sender);
          if (finalSenderEntityAccountId && !finalSenderEntityId) {
            finalSenderEntityId = String(sender);
            finalSenderEntityType = "Account";
          }
        } catch (err) {
          console.warn("[Notification] Could not get sender EntityAccountId:", err);
        }
      }

      // Lấy receiverEntityAccountId nếu chưa có
      let finalReceiverEntityAccountId = receiverEntityAccountId;
      let finalReceiverEntityId = receiverEntityId;
      let finalReceiverEntityType = receiverEntityType;

      if (!finalReceiverEntityAccountId && receiver) {
        try {
          finalReceiverEntityAccountId = await getEntityAccountIdByAccountId(receiver);
          if (finalReceiverEntityAccountId && !finalReceiverEntityId) {
            finalReceiverEntityId = String(receiver);
            finalReceiverEntityType = "Account";
          }
        } catch (err) {
          console.warn("[Notification] Could not get receiver EntityAccountId:", err);
        }
      }

      // Nếu có entityAccountId nhưng chưa có entityType, query để lấy
      if (finalSenderEntityAccountId && !finalSenderEntityType) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, finalSenderEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            finalSenderEntityType = result.recordset[0].EntityType;
            if (!finalSenderEntityId) {
              finalSenderEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[Notification] Could not get sender EntityType:", err);
        }
      }

      if (finalReceiverEntityAccountId && !finalReceiverEntityType) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, finalReceiverEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            finalReceiverEntityType = result.recordset[0].EntityType;
            if (!finalReceiverEntityId) {
              finalReceiverEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[Notification] Could not get receiver EntityType:", err);
        }
      }

      const notificationData = {
        type,
        sender, // Backward compatibility
        senderEntityAccountId: finalSenderEntityAccountId,
        senderEntityId: finalSenderEntityId,
        senderEntityType: finalSenderEntityType,
        receiver, // Backward compatibility
        receiverEntityAccountId: finalReceiverEntityAccountId,
        receiverEntityId: finalReceiverEntityId,
        receiverEntityType: finalReceiverEntityType,
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
