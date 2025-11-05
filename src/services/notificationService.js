const Notification = require("../models/notificationModel");

/**
 * Notification Service
 * Helper functions to create notifications for various actions
 */
class NotificationService {
  /**
   * Create a notification
   * @param {Object} data - Notification data
   * @param {String} data.type - Notification type (Confirm, Messages, Like, Comment, Follow)
   * @param {String|ObjectId} data.sender - ID of the user sending the notification
   * @param {String|ObjectId} data.receiver - ID of the user receiving the notification
   * @param {String} data.content - Notification content/message
   * @param {String} data.link - Link to navigate when notification is clicked
   * @returns {Promise<Object>} Created notification
   */
  async createNotification({ type, sender, receiver, content, link }) {
    try {
      const notification = new Notification({
        type,
        sender,
        receiver,
        content,
        link: link || "/",
        status: "Unread",
      });

      await notification.save();
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
   * @param {String|ObjectId} senderId - ID of user who liked
   * @param {String|ObjectId} receiverId - ID of user receiving notification
   * @param {String} postId - ID of the liked post
   * @param {String} senderName - Name of the user who liked
   * @returns {Promise<Object>} Created notification
   */
  async createLikeNotification(senderId, receiverId, postId, senderName = "Someone") {
    return this.createNotification({
      type: "Like",
      sender: senderId,
      receiver: receiverId,
      content: `${senderName} liked your post`,
      link: `/posts/${postId}`,
    });
  }

  /**
   * Create a comment notification
   * @param {String|ObjectId} senderId - ID of user who commented
   * @param {String|ObjectId} receiverId - ID of user receiving notification
   * @param {String} postId - ID of the commented post
   * @param {String} senderName - Name of the user who commented
   * @param {String} commentPreview - Preview of the comment (optional)
   * @returns {Promise<Object>} Created notification
   */
  async createCommentNotification(senderId, receiverId, postId, senderName = "Someone", commentPreview = "") {
    const content = commentPreview
      ? `${senderName} commented: ${commentPreview.substring(0, 50)}${commentPreview.length > 50 ? "..." : ""}`
      : `${senderName} commented on your post`;
    
    return this.createNotification({
      type: "Comment",
      sender: senderId,
      receiver: receiverId,
      content,
      link: `/posts/${postId}`,
    });
  }

  /**
   * Create a follow notification
   * @param {String|ObjectId} senderId - ID of user who followed
   * @param {String|ObjectId} receiverId - ID of user receiving notification
   * @param {String} senderName - Name of the user who followed
   * @returns {Promise<Object>} Created notification
   */
  async createFollowNotification(senderId, receiverId, senderName = "Someone") {
    return this.createNotification({
      type: "Follow",
      sender: senderId,
      receiver: receiverId,
      content: `${senderName} started following you`,
      link: `/profile/${senderId}`,
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
   * @param {String|ObjectId} userId - User ID
   * @returns {Promise<Object>} Unread count
   */
  async getUnreadCount(userId) {
    try {
      const count = await Notification.countDocuments({
        receiver: userId,
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
