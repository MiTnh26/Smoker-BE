const Notification = require('../models/notificationModel');
const notificationService = require('../services/notificationService');
const mongoose = require("mongoose");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");

class NotificationController {
  // Create new notification
  async createNotification(req, res) {
    try {
      console.log('[NotificationController] ===== CREATE NOTIFICATION =====');
      console.log('[NotificationController] Request body:', req.body);
      console.log('[NotificationController] Current user:', {
        userId: req.user?.id,
        entityAccountId: req.user?.entityAccountId,
        email: req.user?.email
      });
      
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
      
      console.log('[NotificationController] Extracted fields:', {
        type,
        receiver,
        receiverEntityAccountId,
        sender,
        senderEntityAccountId
      });

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

      // Validate required fields
      if (!type) {
        console.error('[NotificationController] Missing required field: type');
        return res.status(400).json({
          success: false,
          message: "Type is required"
        });
      }
      
      if (!finalReceiverEntityAccountId) {
        console.error('[NotificationController] Missing required field: receiverEntityAccountId');
        return res.status(400).json({
          success: false,
          message: "receiverEntityAccountId is required"
        });
      }
      
      if (!finalSenderEntityAccountId) {
        console.error('[NotificationController] Missing required field: senderEntityAccountId');
        return res.status(400).json({
          success: false,
          message: "senderEntityAccountId is required"
        });
      }
      
      if (!content) {
        console.error('[NotificationController] Missing required field: content');
        return res.status(400).json({
          success: false,
          message: "Content is required"
        });
      }
      
      if (!link) {
        console.error('[NotificationController] Missing required field: link');
        return res.status(400).json({
          success: false,
          message: "Link is required"
        });
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

      console.log('[NotificationController] Notification data to save:', {
        type: notificationData.type,
        senderEntityAccountId: notificationData.senderEntityAccountId,
        receiverEntityAccountId: notificationData.receiverEntityAccountId,
        hasContent: !!notificationData.content,
        hasLink: !!notificationData.link
      });

      const notification = new Notification(notificationData);
      await notification.save();
      
      console.log('[NotificationController] Notification created successfully:', notification._id);

      res.status(201).json({
        success: true,
        data: notification,
        message: "Notification created successfully"
      });
    } catch (error) {
      console.error('[NotificationController] ===== CREATE NOTIFICATION ERROR =====');
      console.error('[NotificationController] Error:', error);
      console.error('[NotificationController] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      console.error('[NotificationController] Request body:', req.body);
      
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get user notifications (enriched)
  async getNotifications(req, res) {
    try {
      const { entityAccountId: requestedEntityAccountId, page = 1, limit = 10 } = req.query;

      if (!requestedEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required."
        });
      }

      const entityAccountId = String(requestedEntityAccountId).trim();
      const pageInt = parseInt(page, 10);
      const limitInt = parseInt(limit, 10);
      
      const { notifications, total } = await notificationService.getEnrichedNotifications(entityAccountId, { page: pageInt, limit: limitInt });

      res.status(200).json({
        success: true,
        data: notifications,
        pagination: {
          page: pageInt,
          limit: limitInt,
          total,
          pages: Math.ceil(total / limitInt)
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
      const requestedEntityAccountId = req.query?.entityAccountId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // BẮT BUỘC phải có entityAccountId - không dùng AccountId để tránh nhầm lẫn
      if (!requestedEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."
        });
      }

      // Chỉ query theo EntityAccountId - không fallback về AccountId
      const entityAccountId = String(requestedEntityAccountId).trim();
      const query = {
        _id: notificationId,
        receiverEntityAccountId: entityAccountId
      };

      const notification = await Notification.findOneAndUpdate(
        query,
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
      const requestedEntityAccountId = req.query?.entityAccountId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // BẮT BUỘC phải có entityAccountId - không dùng AccountId để tránh nhầm lẫn
      if (!requestedEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."
        });
      }

      // Chỉ query theo EntityAccountId - không fallback về AccountId
      // Exclude Messages type - message notifications are handled separately
      const entityAccountId = String(requestedEntityAccountId).trim();
      const query = {
        status: "Unread",
        receiverEntityAccountId: entityAccountId,
        type: { $ne: "Messages" } // Exclude message notifications
      };

      await Notification.updateMany(
        query,
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
      const userId = req.user?.id;
      const requestedEntityAccountId = req.query?.entityAccountId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      // BẮT BUỘC phải có entityAccountId - không dùng AccountId để tránh nhầm lẫn
      if (!requestedEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required. Cannot use AccountId to avoid confusion between roles."
        });
      }

      // Chỉ query theo EntityAccountId - không fallback về AccountId
      // Exclude Messages type - message notifications are handled separately
      const entityAccountId = String(requestedEntityAccountId).trim();
      const count = await Notification.countDocuments({
        receiverEntityAccountId: entityAccountId,
        status: "Unread",
        type: { $ne: "Messages" } // Exclude message notifications
      });

      res.status(200).json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error("❌ Error in getUnreadCount:", error);
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
