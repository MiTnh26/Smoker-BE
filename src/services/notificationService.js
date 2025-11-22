const Notification = require("../models/notificationModel");
const { getPool, sql } = require("../db/sqlserver");

/**
 * Notification Service
 * Helper functions to create notifications for various actions
 */
class NotificationService {
  /**
   * Get user name from entityAccountId
   * @param {String} entityAccountId - EntityAccountId to get name for
   * @returns {Promise<String>} User name or "Someone" as fallback
   */
  async getUserNameFromEntityAccountId(entityAccountId) {
    try {
      if (!entityAccountId) return "Someone";
      
      const pool = await getPool();
      let ea;
      try {
        ea = await pool.request()
          .input("id", sql.UniqueIdentifier, entityAccountId)
          .query("SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @id");
      } catch (queryError) {
        try {
          ea = await pool.request()
            .input("id", sql.NVarChar(50), entityAccountId)
            .query("SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE LOWER(CAST(EntityAccountId AS NVARCHAR(50))) = LOWER(@id)");
        } catch (stringError) {
          console.warn("[NotificationService] Error querying EntityAccountId:", stringError.message);
          return "Someone";
        }
      }
      
      if (ea.recordset.length === 0) {
        return "Someone";
      }
      
      const { EntityType, EntityId } = ea.recordset[0];
      
      if (EntityType === 'BarPage') {
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 BarName AS name FROM BarPages WHERE BarPageId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      } else if (EntityType === 'BusinessAccount') {
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 UserName AS name FROM BussinessAccounts WHERE BussinessAccountId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      } else {
        // Default Account
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 UserName AS name FROM Accounts WHERE AccountId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      }
      
      return "Someone";
    } catch (error) {
      console.error("[NotificationService] Error getting userName from entityAccountId:", error);
      return "Someone";
    }
  }
  /**
   * Create a notification
   * @param {Object} data - Notification data
   * @param {String} data.type - Notification type (Confirm, Messages, Like, Comment, Follow)
   * @param {String|ObjectId} data.sender - ID of the user sending the notification (AccountId - backward compatibility)
   * @param {String} data.senderEntityAccountId - EntityAccountId of sender (required)
   * @param {String} data.senderEntityId - EntityId of sender (optional)
   * @param {String} data.senderEntityType - EntityType of sender (optional)
   * @param {String|ObjectId} data.receiver - ID of the user receiving the notification (AccountId - backward compatibility)
   * @param {String} data.receiverEntityAccountId - EntityAccountId of receiver (required)
   * @param {String} data.receiverEntityId - EntityId of receiver (optional)
   * @param {String} data.receiverEntityType - EntityType of receiver (optional)
   * @param {String} data.content - Notification content/message
   * @param {String} data.link - Link to navigate when notification is clicked
   * @returns {Promise<Object>} Created notification
   */
  async createNotification({ 
    type, 
    sender, 
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver, 
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType,
    content, 
    link 
  }) {
    try {
      const notification = new Notification({
        type,
        sender, // Backward compatibility
        senderEntityAccountId,
        senderEntityId,
        senderEntityType,
        receiver, // Backward compatibility
        receiverEntityAccountId,
        receiverEntityId,
        receiverEntityType,
        content,
        link: link || "/",
        status: "Unread",
      });

      await notification.save();
      
      // Emit socket event to receiver
      try {
        const { getIO } = require("../utils/socket");
        const io = getIO();
        const receiverId = receiverEntityAccountId || receiver;
        const receiverRoom = String(receiverId);
        
        // Get unread count
        const unreadResult = await this.getUnreadCount(receiverId);
        const unreadCount = unreadResult.success ? unreadResult.data?.count || 0 : 0;
        
        // Emit to room
        io.to(receiverRoom).emit("new_notification", {
          notification: notification.toObject(),
          unreadCount: unreadCount
        });
        console.log(`[NotificationService] Emitted notification to room: ${receiverRoom}, unreadCount: ${unreadCount}`);
      } catch (socketError) {
        console.warn("[NotificationService] Failed to emit socket event:", socketError.message);
        // Don't fail the notification creation if socket fails
      }
      
      return {
        success: true,
        data: notification,
      };
    } catch (error) {
      console.error("Error creating notification:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a like notification
   * @param {Object} options - Notification options
   * @param {String|ObjectId} options.sender - AccountId of user who liked (backward compatibility)
   * @param {String} options.senderEntityAccountId - EntityAccountId of sender (required)
   * @param {String} options.senderEntityId - EntityId of sender (optional)
   * @param {String} options.senderEntityType - EntityType of sender (optional)
   * @param {String|ObjectId} options.receiver - AccountId of receiver (backward compatibility)
   * @param {String} options.receiverEntityAccountId - EntityAccountId of receiver (required)
   * @param {String} options.receiverEntityId - EntityId of receiver (optional)
   * @param {String} options.receiverEntityType - EntityType of receiver (optional)
   * @param {String} options.postId - ID of the liked post/story
   * @param {String} options.isStory - Whether it's a story (default: false)
   * @param {String} options.senderName - Name of the user who liked (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Created notification
   */
  async createLikeNotification({
    sender,
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver,
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType,
    postId,
    isStory = false,
    senderName = null
  }) {
    // Get sender name if not provided
    let finalSenderName = senderName;
    if (!finalSenderName && senderEntityAccountId) {
      finalSenderName = await this.getUserNameFromEntityAccountId(senderEntityAccountId);
    }
    
    const content = isStory 
      ? `${finalSenderName} đã thích story của bạn`
      : `${finalSenderName} đã thích bài viết của bạn`;
    const link = isStory ? `/stories/${postId}` : `/posts/${postId}`;
    
    return this.createNotification({
      type: "Like",
      sender,
      senderEntityAccountId,
      senderEntityId,
      senderEntityType,
      receiver,
      receiverEntityAccountId,
      receiverEntityId,
      receiverEntityType,
      content,
      link,
    });
  }

  /**
   * Create a comment notification
   * @param {Object} options - Notification options
   * @param {String|ObjectId} options.sender - AccountId of user who commented (backward compatibility)
   * @param {String} options.senderEntityAccountId - EntityAccountId of sender (required)
   * @param {String} options.senderEntityId - EntityId of sender (optional)
   * @param {String} options.senderEntityType - EntityType of sender (optional)
   * @param {String|ObjectId} options.receiver - AccountId of receiver (backward compatibility)
   * @param {String} options.receiverEntityAccountId - EntityAccountId of receiver (required)
   * @param {String} options.receiverEntityId - EntityId of receiver (optional)
   * @param {String} options.receiverEntityType - EntityType of receiver (optional)
   * @param {String} options.postId - ID of the commented post
   * @param {String} options.senderName - Name of the user who commented (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Created notification
   */
  async createCommentNotification({
    sender,
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver,
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType,
    postId,
    senderName = null
  }) {
    // Get sender name if not provided
    let finalSenderName = senderName;
    if (!finalSenderName && senderEntityAccountId) {
      finalSenderName = await this.getUserNameFromEntityAccountId(senderEntityAccountId);
    }
    
    const content = `${finalSenderName} đã bình luận bài viết của bạn`;
    
    return this.createNotification({
      type: "Comment",
      sender,
      senderEntityAccountId,
      senderEntityId,
      senderEntityType,
      receiver,
      receiverEntityAccountId,
      receiverEntityId,
      receiverEntityType,
      content,
      link: `/posts/${postId}`,
    });
  }

  /**
   * Create a reply notification (for comment/reply replies)
   * @param {Object} options - Notification options
   * @param {String|ObjectId} options.sender - AccountId of user who replied (backward compatibility)
   * @param {String} options.senderEntityAccountId - EntityAccountId of sender (required)
   * @param {String} options.senderEntityId - EntityId of sender (optional)
   * @param {String} options.senderEntityType - EntityType of sender (optional)
   * @param {String|ObjectId} options.receiver - AccountId of receiver (backward compatibility)
   * @param {String} options.receiverEntityAccountId - EntityAccountId of receiver (required)
   * @param {String} options.receiverEntityId - EntityId of receiver (optional)
   * @param {String} options.receiverEntityType - EntityType of receiver (optional)
   * @param {String} options.postId - ID of the post
   * @param {String} options.senderName - Name of the user who replied (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Created notification
   */
  async createReplyNotification({
    sender,
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver,
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType,
    postId,
    commentId = null, // commentId to scroll to (the comment/reply that was replied to)
    senderName = null
  }) {
    // Get sender name if not provided
    let finalSenderName = senderName;
    if (!finalSenderName && senderEntityAccountId) {
      finalSenderName = await this.getUserNameFromEntityAccountId(senderEntityAccountId);
    }
    
    const content = `${finalSenderName} đã trả lời bình luận của bạn`;
    
    // Build link with commentId if provided
    let link = `/posts/${postId}`;
    if (commentId) {
      link = `/posts/${postId}?commentId=${commentId}`;
    }
    
    return this.createNotification({
      type: "Comment", // Use Comment type for replies
      sender,
      senderEntityAccountId,
      senderEntityId,
      senderEntityType,
      receiver,
      receiverEntityAccountId,
      receiverEntityId,
      receiverEntityType,
      content,
      link,
    });
  }

  /**
   * Create a follow notification
   * @param {Object} options - Notification options
   * @param {String|ObjectId} options.sender - AccountId of user who followed (backward compatibility)
   * @param {String} options.senderEntityAccountId - EntityAccountId of sender (required)
   * @param {String} options.senderEntityId - EntityId of sender (optional)
   * @param {String} options.senderEntityType - EntityType of sender (optional)
   * @param {String|ObjectId} options.receiver - AccountId of receiver (backward compatibility)
   * @param {String} options.receiverEntityAccountId - EntityAccountId of receiver (required)
   * @param {String} options.receiverEntityId - EntityId of receiver (optional)
   * @param {String} options.receiverEntityType - EntityType of receiver (optional)
   * @param {String} options.senderName - Name of the user who followed (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Created notification
   */
  async createFollowNotification({
    sender,
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver,
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType,
    senderName = null
  }) {
    // Get sender name if not provided
    let finalSenderName = senderName;
    if (!finalSenderName && senderEntityAccountId) {
      finalSenderName = await this.getUserNameFromEntityAccountId(senderEntityAccountId);
    }
    
    const content = `${finalSenderName} đã bắt đầu theo dõi bạn`;
    
    return this.createNotification({
      type: "Follow",
      sender,
      senderEntityAccountId,
      senderEntityId,
      senderEntityType,
      receiver,
      receiverEntityAccountId,
      receiverEntityId,
      receiverEntityType,
      content,
      link: `/profile/${senderEntityAccountId}`,
    });
  }

  /**
   * Create a message notification
   * @param {String|ObjectId} senderId - ID of user who sent message
   * @param {String|ObjectId} receiverId - ID of user receiving notification
   * @param {String} senderName - Name of the user who sent message
   * @param {String} messagePreview - Preview of the message (optional)
   * @returns {Promise<Object>} Created notification
   */
  async createMessageNotification(senderId, receiverId, senderName = "Someone", messagePreview = "") {
    const content = messagePreview
      ? `${senderName}: ${messagePreview.substring(0, 50)}${messagePreview.length > 50 ? "..." : ""}`
      : `${senderName} sent you a message`;
    
    return this.createNotification({
      type: "Messages",
      sender: senderId,
      receiver: receiverId,
      content,
      link: `/messages/${senderId}`,
    });
  }

  /**
   * Create a confirm/approval notification
   * @param {String|ObjectId} senderId - ID of entity sending confirmation
   * @param {String|ObjectId} receiverId - ID of user receiving notification
   * @param {String} content - Notification content
   * @param {String} link - Link to navigate (optional)
   * @returns {Promise<Object>} Created notification
   */
  async createConfirmNotification(senderId, receiverId, content, link = "/") {
    return this.createNotification({
      type: "Confirm",
      sender: senderId,
      receiver: receiverId,
      content,
      link,
    });
  }

  /**
   * Mark notification as read
   * @param {String|ObjectId} notificationId - Notification ID
   * @param {String|ObjectId} userId - User ID (to verify ownership)
   * @returns {Promise<Object>} Updated notification
   */
  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        {
          _id: notificationId,
          receiver: userId,
        },
        { status: "Read" },
        { new: true }
      );

      if (!notification) {
        return {
          success: false,
          error: "Notification not found",
        };
      }

      return {
        success: true,
        data: notification,
      };
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {String|ObjectId} userId - User ID
   * @returns {Promise<Object>} Update result
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        {
          receiver: userId,
          status: "Unread",
        },
        { status: "Read" }
      );

      return {
        success: true,
        data: { updatedCount: result.modifiedCount },
      };
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get unread count for a user
   * @param {String|ObjectId} userId - User ID (AccountId or EntityAccountId)
   * @returns {Promise<Object>} Unread count
   */
  async getUnreadCount(userId) {
    try {
      // Try to find by receiverEntityAccountId first, then fallback to receiver (AccountId)
      const count = await Notification.countDocuments({
        $or: [
          { receiverEntityAccountId: userId },
          { receiver: userId }
        ],
        status: "Unread",
      });

      return {
        success: true,
        data: { count },
      };
    } catch (error) {
      console.error("Error getting unread count:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new NotificationService();
