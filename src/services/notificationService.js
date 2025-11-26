const Notification = require("../models/notificationModel");
const { getPool, sql } = require("../db/sqlserver");

/**
 * Notification Service
 * Helper functions to create notifications for various actions
 */
class NotificationService {
  /**
   * Get user name from entityAccountId
   * 
   * @param {String} entityAccountId - EntityAccountId to get name for
   * @returns {Promise<String>} User name or "Someone" as fallback
   */
  async getUserNameFromEntityAccountId(entityAccountId) {
    const { t } = require("../utils/translation");
    
    if (!entityAccountId) {
      return t('common.someone', 'vi'); // Default fallback
    }
    
    try {
      const pool = await getPool();
      
      // Try to get EntityAccount info
      let ea;
      try {
        ea = await pool.request()
          .input("id", sql.UniqueIdentifier, entityAccountId)
          .query("SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @id");
      } catch (queryError) {
        // Fallback: try as string
        try {
          ea = await pool.request()
            .input("id", sql.NVarChar(50), entityAccountId)
            .query("SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE LOWER(CAST(EntityAccountId AS NVARCHAR(50))) = LOWER(@id)");
        } catch (stringError) {
          console.warn("[NotificationService] Error querying EntityAccountId:", stringError.message);
          return t('common.someone', 'vi');
        }
      }
      
      if (ea.recordset.length === 0) {
        return t('common.someone', 'vi');
      }
      
      const { EntityType, EntityId } = ea.recordset[0];
      
      // Get name based on entity type
      if (EntityType === 'BarPage') {
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 BarName AS name FROM BarPages WHERE BarPageId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      } else if (EntityType === 'BusinessAccount') {
        // Bảng BussinessAccounts chỉ chứa DJ và Dancer, dùng UserName (không có BusinessName)
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 UserName AS name FROM BussinessAccounts WHERE BussinessAccountId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      } else if (EntityType === 'Account') {
        const r = await pool.request()
          .input("eid", sql.UniqueIdentifier, EntityId)
          .query("SELECT TOP 1 UserName AS name FROM Accounts WHERE AccountId = @eid");
        if (r.recordset.length > 0 && r.recordset[0].name) {
          return r.recordset[0].name;
        }
      }
      
      return t('common.someone', 'vi');
    } catch (error) {
      console.error("[NotificationService] Error getting user name:", error);
      return t('common.someone', 'vi');
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
      if (!receiverEntityAccountId) {
        throw new Error("receiverEntityAccountId is required for createNotification.");
      }

      const notification = new Notification({
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
        link: link || "/",
        status: "Unread",
      });

      console.log(`[NotificationService] Creating notification:`, {
        type: notification.type,
        sender: notification.senderEntityAccountId,
        receiver: notification.receiverEntityAccountId,
        link: notification.link
      });

      await notification.save();
      
      if (type !== "Messages") {
        try {
          const { getIO } = require("../utils/socket");
          const io = getIO();

          if (!io) {
            console.warn("[NotificationService] Socket.IO not initialized, skipping emit.");
          } else {
            const receiverRoom = String(receiverEntityAccountId).trim();
            const unreadResult = await this.getUnreadCount(receiverEntityAccountId);
            const unreadCount = unreadResult.success ? unreadResult.data?.count || 0 : 0;
            
            io.to(receiverRoom).emit("new_notification", {
              notification: notification.toObject(),
              unreadCount: unreadCount
            });

            console.log(`[NotificationService] Emitted notification to room: ${receiverRoom}`, {
              type: type,
              receiver: receiverEntityAccountId,
              unreadCount: unreadCount,
              timestamp: new Date().toISOString()
            });
          }
        } catch (socketError) {
          console.error("[NotificationService] Failed to emit socket event:", {
            error: socketError.message,
            stack: socketError.stack,
            receiverEntityAccountId: receiverEntityAccountId,
            type: type
          });
        }
      } else {
        console.log(`[NotificationService] Skipped socket emit for Messages notification.`);
      }
      
      return {
        success: true,
        data: notification,
      };
    } catch (error) {
      console.error("Error creating notification:", {
        error: error.message,
        stack: error.stack,
        data: { type, senderEntityAccountId, receiverEntityAccountId }
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a like notification
   * 
   * Note: Content is stored as raw data (sender name only).
   * Frontend will handle translation based on user's locale preference.
   * 
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
    
    // Store raw data (sender name only)
    // Frontend will translate: "John liked your post" or "John đã thích bài viết của bạn"
    const content = finalSenderName;

    console.log(`[NotificationService] Preparing to create Like notification:`, {
      sender: senderEntityAccountId,
      receiver: receiverEntityAccountId,
      postId: postId,
      isStory: isStory
    });
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
      content, // Raw data: "John"
      link,
      // Store isStory in a way FE can access (if needed, can add to schema later)
      // For now, FE can check link to determine if it's a story
    });
  }

  /**
   * Create a comment notification
   * 
   * Note: Content is stored as raw data (sender name only).
   * Frontend will handle translation based on user's locale preference.
   * 
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
    
    // Store raw data (sender name only)
    // Frontend will translate: "John commented on your post" or "John đã bình luận bài viết của bạn"
    const content = finalSenderName;
    
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
      content, // Raw data: "John"
      link: `/posts/${postId}`,
    });
  }

  /**
   * Create a reply notification (for comment/reply replies)
   * 
   * Note: Content is stored as raw data (sender name only).
   * Frontend will handle translation based on user's locale preference.
   * 
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
   * @param {String} options.commentId - commentId to scroll to (the comment/reply that was replied to)
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
    
    // Store raw data (sender name only)
    // Frontend will translate: "John replied to your comment" or "John đã trả lời bình luận của bạn"
    const content = finalSenderName;
    
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
      content, // Raw data: "John"
      link,
    });
  }

  /**
   * Create a follow notification
   * 
   * Note: Content is stored as raw data (sender name only).
   * Frontend will handle translation based on user's locale preference.
   * 
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
    
    // Store raw data (sender name only)
    // Frontend will translate: "John started following you" or "John đã bắt đầu theo dõi bạn"
    const content = finalSenderName;
    
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
      content, // Raw data: "John"
      link: `/profile/${senderEntityAccountId}`,
    });
  }

  /**
   * Create a message notification
   * 
   * Note: Content is stored as raw data (no translation).
   * Frontend will handle translation based on user's locale preference.
   * 
   * @param {String} senderEntityAccountId - ID of user who sent message
   * @param {String} receiverEntityAccountId - ID of user receiving notification
   * @param {String} senderName - Name of the sender (fallback: "Someone")
   * @param {String} messagePreview - Preview of the message (optional)
   * @param {String} conversationId - Conversation ID for link (optional)
   * @returns {Promise<Object>} Created notification
   */
  async createMessageNotification(
    senderEntityAccountId, 
    receiverEntityAccountId, 
    senderName = "Someone", 
    messagePreview = "", 
    conversationId = null
  ) {
    // Format content: "SenderName: MessagePreview" or just "SenderName"
    // Frontend will translate "sent you a message" based on user's locale
    let content;
    if (messagePreview) {
      const preview = messagePreview.length > 50 
        ? messagePreview.substring(0, 50) + "..." 
        : messagePreview;
      content = `${senderName}: ${preview}`;
    } else {
      // No preview: Frontend will add "sent you a message" translation
      content = senderName;
    }
    
    // Link to conversation or messages page
    const link = conversationId 
      ? `/messages/${conversationId}` 
      : `/messages/${senderEntityAccountId}`;
    
    return this.createNotification({
      type: "Messages",
      senderEntityAccountId,
      receiverEntityAccountId,
      content, // Raw data, no translation
      link,
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
   * 
   * NOTE: Hàm này được dùng trong socket emit, chỉ query cho EntityAccountId cụ thể
   * KHÔNG fallback về AccountId để tránh nhầm lẫn giữa các roles
   * 
   * @param {String|ObjectId} entityAccountId - EntityAccountId của user (BẮT BUỘC, không phải AccountId)
   * @returns {Promise<Object>} Unread count
   */
  async getUnreadCount(entityAccountId) {
    try {
      if (!entityAccountId) {
        return {
          success: true,
          data: { count: 0 },
        };
      }

      // CHỈ query theo receiverEntityAccountId - KHÔNG fallback về receiver (AccountId)
      // Thà lỗi còn sửa, chứ không lấy trường hợp không đúng
      // Exclude Messages type - message notifications are handled separately
      const count = await Notification.countDocuments({
        receiverEntityAccountId: String(entityAccountId).trim(),
        status: "Unread",
        type: { $ne: "Messages" } // Exclude message notifications
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
