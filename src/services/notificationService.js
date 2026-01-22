const Notification = require('../models/notificationModel');
const { getPool, sql } = require('../db/sqlserver');
const { getIO } = require('../utils/socket');

class NotificationService {

  /**
   * Lấy danh sách thông báo và làm giàu dữ liệu với thông tin người gửi.
   * @param {string} entityAccountId - ID của người nhận thông báo.
   * @param {object} pagination - Tùy chọn phân trang { page, limit }.
   * @returns {Promise<object>} - Danh sách thông báo đã được làm giàu và thông tin phân trang.
   */
  async getEnrichedNotifications(entityAccountId, { page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    // Normalize entityAccountId để đảm bảo match với DB (case-insensitive)
    const normalizedEntityAccountId = String(entityAccountId).trim().toLowerCase();

    // 1. Lấy thông báo từ MongoDB - dùng $regex để match case-insensitive
    const notifications = await Notification.find({
      receiverEntityAccountId: { $regex: new RegExp(`^${normalizedEntityAccountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      type: { $ne: "Messages" } 
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean(); // Sử dụng lean() để có object thuần túy, nhanh hơn

    if (notifications.length === 0) {
      return { notifications: [], total: 0 };
    }
    
    // 2. Thu thập ID của người gửi (normalize về lowercase)
    const senderIds = [...new Set(notifications
        .map(n => String(n.senderEntityAccountId || '').trim().toLowerCase())
        .filter(Boolean)
    )];

    let senderInfoMap = new Map();

    // 3. Lấy thông tin người gửi từ SQL Server
    if (senderIds.length > 0) {
      try {
        const pool = await getPool();
        const placeholders = senderIds.map((_, i) => `@id${i}`).join(',');
        const request = pool.request();
        // SQL Server UniqueIdentifier có thể nhận cả uppercase và lowercase
        senderIds.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));

        const result = await request.query(`
          SELECT 
            EA.EntityAccountId,
            CASE 
              WHEN EA.EntityType = 'Account' THEN A.UserName
              WHEN EA.EntityType = 'BarPage' THEN BP.BarName
              WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
              ELSE NULL
            END AS name,
            CASE 
              WHEN EA.EntityType = 'Account' THEN A.Avatar
              WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
              WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
              ELSE NULL
            END AS avatar
          FROM EntityAccounts EA
          LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
          LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
          LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
          WHERE EA.EntityAccountId IN (${placeholders})
        `);

        result.recordset.forEach(row => {
          // Normalize EntityAccountId về lowercase để match với notification
          const normalizedId = String(row.EntityAccountId).trim().toLowerCase();
          senderInfoMap.set(normalizedId, {
            name: row.name || 'Một người dùng',
            avatar: row.avatar
          });
        });
        
        console.log('[NotificationService] Fetched sender info for', senderInfoMap.size, 'senders');
        console.log('[NotificationService] Sender IDs from notifications:', senderIds);
        console.log('[NotificationService] Sender info map keys:', Array.from(senderInfoMap.keys()));
    } catch (error) {
        console.error('[NotificationService] Error fetching sender info:', error);
        console.error('[NotificationService] Sender IDs that failed:', senderIds);
    }
  }

    // 4. Gắn thông tin người gửi vào thông báo
    const enrichedNotifications = notifications.map(n => {
      // If notification is anonymous, use anonymous info
      if (n.isAnonymous) {
        return {
          ...n,
          sender: { name: 'Ai đó', avatar: '/images/an-danh.png' },
          isAnonymous: true
        };
      }
      
      // Normalize senderEntityAccountId để match với map
      const normalizedSenderId = String(n.senderEntityAccountId || '').trim().toLowerCase();
      const senderInfo = senderInfoMap.get(normalizedSenderId);
      
      if (!senderInfo) {
        console.warn('[NotificationService] No sender info found for:', normalizedSenderId, 'Original:', n.senderEntityAccountId);
      }
      
      return {
        ...n,
        sender: senderInfo || { name: 'Một người dùng', avatar: null },
        isAnonymous: false
        };
    });

    // 5. Lấy tổng số thông báo để phân trang
    const total = await Notification.countDocuments({
      receiverEntityAccountId: { $regex: new RegExp(`^${normalizedEntityAccountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      type: { $ne: "Messages" }
      });

    return { notifications: enrichedNotifications, total };
  }

  /**
   * Tạo notification cho comment
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
    isAnonymousComment = false,
  }) {
    try {
      if (!senderEntityAccountId || !receiverEntityAccountId) {
        console.warn('[NotificationService] Missing entityAccountId for comment notification');
        return;
      }

      // Normalize GUIDs to lowercase for consistency
      const normalizedSenderEntityAccountId = String(senderEntityAccountId).trim().toLowerCase();
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Lấy thông tin người gửi từ SQL Server để tạo content
      let senderName = 'Một người dùng';
      let senderAvatar = null;
      if (!isAnonymousComment) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
            .query(`
              SELECT TOP 1
                CASE 
                  WHEN EA.EntityType = 'Account' THEN A.UserName
                  WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                  WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                  ELSE NULL
                END AS name,
                CASE 
                  WHEN EA.EntityType = 'Account' THEN A.Avatar
                  WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
                  WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
                  ELSE NULL
                END AS avatar
              FROM EntityAccounts EA
              LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
              LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
              LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
              WHERE EA.EntityAccountId = @EntityAccountId
            `);
          if (result.recordset.length > 0) {
            if (result.recordset[0].name) {
            senderName = result.recordset[0].name;
            }
            if (result.recordset[0].avatar) {
              senderAvatar = result.recordset[0].avatar;
            }
          }
        } catch (err) {
          console.warn('[NotificationService] Could not get sender name for comment notification:', err);
        }
      } else {
        senderName = 'Ai đó';
        senderAvatar = '/images/an-danh.png';
      }

      const notification = new Notification({
        type: "Comment",
        sender: sender || null,
        senderEntityAccountId: normalizedSenderEntityAccountId,
        senderEntityId: senderEntityId || null,
        senderEntityType: senderEntityType || null,
        receiver: receiver || null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: receiverEntityId || null,
        receiverEntityType: receiverEntityType || null,
        content: `${senderName} đã bình luận bài viết của bạn`,
        link: `/posts/${postId}`,
        status: "Unread",
        isAnonymous: isAnonymousComment
      });

      await notification.save();
      console.log('[NotificationService] Comment notification created:', notification._id);

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          isAnonymous: notification.isAnonymous,
          sender: {
            name: senderName,
            avatar: senderAvatar
          }
        };
        
        // Emit to receiver's EntityAccountId room (normalized to lowercase)
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
        // Don't fail notification creation if socket fails
      }
    } catch (error) {
      console.error('[NotificationService] Error creating comment notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification cho reply
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
    commentId,
    isAnonymousComment = false,
  }) {
    try {
      if (!senderEntityAccountId || !receiverEntityAccountId) {
        console.warn('[NotificationService] Missing entityAccountId for reply notification');
        return;
      }

      // Normalize GUIDs to lowercase for consistency
      const normalizedSenderEntityAccountId = String(senderEntityAccountId).trim().toLowerCase();
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Lấy thông tin người gửi từ SQL Server để tạo content
      let senderName = 'Một người dùng';
      let senderAvatar = null;
      if (!isAnonymousComment) {
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input("EntityAccountId", sql.UniqueIdentifier, normalizedSenderEntityAccountId)
          .query(`
            SELECT TOP 1
              CASE 
                WHEN EA.EntityType = 'Account' THEN A.UserName
                WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                ELSE NULL
                END AS name,
                CASE 
                  WHEN EA.EntityType = 'Account' THEN A.Avatar
                  WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
                  WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
                  ELSE NULL
                END AS avatar
            FROM EntityAccounts EA
            LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
            LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
            LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
            WHERE EA.EntityAccountId = @EntityAccountId
          `);
          if (result.recordset.length > 0) {
            if (result.recordset[0].name) {
          senderName = result.recordset[0].name;
            }
            if (result.recordset[0].avatar) {
              senderAvatar = result.recordset[0].avatar;
            }
        }
      } catch (err) {
        console.warn('[NotificationService] Could not get sender name for reply notification:', err);
        }
      } else {
        senderName = 'Ai đó';
        senderAvatar = '/images/an-danh.png';
      }

      const link = commentId 
        ? `/posts/${postId}?commentId=${commentId}`
        : `/posts/${postId}`;

      const notification = new Notification({
        type: "Comment",
        sender: sender || null,
        senderEntityAccountId: normalizedSenderEntityAccountId,
        senderEntityId: senderEntityId || null,
        senderEntityType: senderEntityType || null,
        receiver: receiver || null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: receiverEntityId || null,
        receiverEntityType: receiverEntityType || null,
        content: `${senderName} đã trả lời bình luận của bạn`,
        link: link,
        status: "Unread",
        isAnonymous: isAnonymousComment
      });

      await notification.save();
      console.log('[NotificationService] Reply notification created:', notification._id);

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          isAnonymous: notification.isAnonymous,
          sender: {
            name: senderName,
            avatar: senderAvatar
          }
        };
        
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
      }
    } catch (error) {
      console.error('[NotificationService] Error creating reply notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification cho like
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
    isStory = false
  }) {
    try {
      if (!senderEntityAccountId || !receiverEntityAccountId) {
        console.warn('[NotificationService] Missing entityAccountId for like notification');
        return;
      }

      // Normalize GUIDs to lowercase for consistency
      const normalizedSenderEntityAccountId = String(senderEntityAccountId).trim().toLowerCase();
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Lấy thông tin người gửi từ SQL Server để tạo content
      let senderName = 'Một người dùng';
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input("EntityAccountId", sql.UniqueIdentifier, normalizedSenderEntityAccountId)
          .query(`
            SELECT TOP 1
              CASE 
                WHEN EA.EntityType = 'Account' THEN A.UserName
                WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                ELSE NULL
              END AS name
            FROM EntityAccounts EA
            LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
            LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
            LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
            WHERE EA.EntityAccountId = @EntityAccountId
          `);
        if (result.recordset.length > 0 && result.recordset[0].name) {
          senderName = result.recordset[0].name;
        }
      } catch (err) {
        console.warn('[NotificationService] Could not get sender name for like notification:', err);
      }

      const content = isStory 
        ? `${senderName} đã thích story của bạn`
        : `${senderName} đã thích bài viết của bạn`;

      const notification = new Notification({
        type: "Like",
        sender: sender || null,
        senderEntityAccountId: normalizedSenderEntityAccountId,
        senderEntityId: senderEntityId || null,
        senderEntityType: senderEntityType || null,
        receiver: receiver || null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: receiverEntityId || null,
        receiverEntityType: receiverEntityType || null,
        content: content,
        link: isStory ? `/stories/${postId}` : `/posts/${postId}`,
        status: "Unread"
      });

      await notification.save();
      console.log('[NotificationService] Like notification created:', notification._id);

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          sender: {
            name: senderName,
            avatar: null
          }
        };
        
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
      }
    } catch (error) {
      console.error('[NotificationService] Error creating like notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification cho follow
   */
  async createFollowNotification({
    sender,
    senderEntityAccountId,
    senderEntityId,
    senderEntityType,
    receiver,
    receiverEntityAccountId,
    receiverEntityId,
    receiverEntityType
  }) {
    try {
      if (!senderEntityAccountId || !receiverEntityAccountId) {
        console.warn('[NotificationService] Missing entityAccountId for follow notification');
        return;
      }

      // Normalize GUIDs to lowercase for consistency
      const normalizedSenderEntityAccountId = String(senderEntityAccountId).trim().toLowerCase();
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Lấy thông tin người gửi từ SQL Server để tạo content
      let senderName = 'Một người dùng';
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input("EntityAccountId", sql.UniqueIdentifier, normalizedSenderEntityAccountId)
          .query(`
            SELECT TOP 1
              CASE 
                WHEN EA.EntityType = 'Account' THEN A.UserName
                WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                ELSE NULL
              END AS name
            FROM EntityAccounts EA
            LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
            LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
            LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
            WHERE EA.EntityAccountId = @EntityAccountId
          `);
        if (result.recordset.length > 0 && result.recordset[0].name) {
          senderName = result.recordset[0].name;
        }
      } catch (err) {
        console.warn('[NotificationService] Could not get sender name for follow notification:', err);
      }

      // Xác định link dựa trên entityType của sender
      // ProfilePage expects EntityAccountId, not EntityId (AccountId/BarPageId/etc)
      let link = '/profile';
      if (senderEntityType === 'BarPage' && senderEntityId) {
        link = `/bar/${senderEntityId}`;
      } else if (senderEntityType === 'BusinessAccount' && senderEntityId) {
        link = `/business/${senderEntityId}`;
      } else if (normalizedSenderEntityAccountId) {
        // For Account type and other types, use EntityAccountId for /profile/ route
        // ProfilePage expects EntityAccountId, not AccountId (senderEntityId)
        link = `/profile/${normalizedSenderEntityAccountId}`;
      }

      const notification = new Notification({
        type: "Follow",
        sender: sender || null,
        senderEntityAccountId: normalizedSenderEntityAccountId,
        senderEntityId: senderEntityId || null,
        senderEntityType: senderEntityType || null,
        receiver: receiver || null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: receiverEntityId || null,
        receiverEntityType: receiverEntityType || null,
        content: `${senderName} đã theo dõi bạn`,
        link: link,
        status: "Unread"
      });

      await notification.save();
      console.log('[NotificationService] Follow notification created:', notification._id);

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          sender: {
            name: senderName,
            avatar: null
          }
        };
        
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
      }
    } catch (error) {
      console.error('[NotificationService] Error creating follow notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification cho từ chối yêu cầu rút tiền
   */
  async createWithdrawRejectionNotification({
    receiverEntityAccountId,
    amount,
    note
  }) {
    try {
      if (!receiverEntityAccountId) {
        console.warn('[NotificationService] Missing receiverEntityAccountId for withdraw rejection notification');
        return;
      }

      // Normalize GUID to lowercase for consistency
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Format số tiền
      const formattedAmount = Number(amount).toLocaleString('vi-VN');

      // Tạo content
      const content = `Yêu cầu rút tiền ${formattedAmount} đ đã bị từ chối. Lý do: ${note || 'Không có lý do cụ thể'}`;

      console.log('[NotificationService] Creating withdraw rejection notification:', {
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        amount: formattedAmount,
        note: note
      });

      const notification = new Notification({
        type: "Wallet",
        sender: null,
        senderEntityAccountId: null, // System notification, không có sender
        senderEntityId: null,
        senderEntityType: null,
        receiver: null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: null,
        receiverEntityType: null,
        content: content,
        link: "/wallet", // Link đến trang ví
        status: "Unread"
      });

      await notification.save();
      console.log('[NotificationService] Withdraw rejection notification created successfully:', {
        id: notification._id,
        type: notification.type,
        receiverEntityAccountId: notification.receiverEntityAccountId,
        content: notification.content
      });

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          isAnonymous: false
        };
        
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
        // Don't fail notification creation if socket fails
      }
    } catch (error) {
      console.error('[NotificationService] Error creating withdraw rejection notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification cho duyệt yêu cầu rút tiền
   */
  async createWithdrawApprovalNotification({
    receiverEntityAccountId,
    amount,
    note
  }) {
    try {
      if (!receiverEntityAccountId) {
        console.warn('[NotificationService] Missing receiverEntityAccountId for withdraw approval notification');
        return;
      }

      // Normalize GUID to lowercase for consistency
      const normalizedReceiverEntityAccountId = String(receiverEntityAccountId).trim().toLowerCase();

      // Format số tiền
      const formattedAmount = Number(amount).toLocaleString('vi-VN');

      // Tạo content
      const content = note 
        ? `Yêu cầu rút tiền ${formattedAmount} đ đã được duyệt. ${note}`
        : `Yêu cầu rút tiền ${formattedAmount} đ đã được duyệt và chuyển khoản thành công.`;

      console.log('[NotificationService] Creating withdraw approval notification:', {
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        amount: formattedAmount,
        note: note
      });

      const notification = new Notification({
        type: "Wallet",
        sender: null,
        senderEntityAccountId: null, // System notification, không có sender
        senderEntityId: null,
        senderEntityType: null,
        receiver: null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        receiverEntityId: null,
        receiverEntityType: null,
        content: content,
        link: "/wallet", // Link đến trang ví
        status: "Unread"
      });

      await notification.save();
      console.log('[NotificationService] Withdraw approval notification created successfully:', {
        id: notification._id,
        type: notification.type,
        receiverEntityAccountId: notification.receiverEntityAccountId,
        content: notification.content
      });

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt,
          isAnonymous: false
        };
        
        const receiverRoom = String(normalizedReceiverEntityAccountId).trim().toLowerCase();
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
        // Don't fail notification creation if socket fails
      }
    } catch (error) {
      console.error('[NotificationService] Error creating withdraw approval notification:', error);
      throw error;
    }
  }

  /**
   * Tạo notification đơn giản (generic)
   */
  async createNotification({
    type,
    sender,
    receiver,
    content,
    link,
    senderEntityAccountId = null,
    receiverEntityAccountId = null
  }) {
    try {
      if (!receiver && !receiverEntityAccountId) {
        console.warn('[NotificationService] Missing receiver or receiverEntityAccountId for notification');
        return;
      }

      // Nếu có receiver (AccountId) nhưng chưa có receiverEntityAccountId, cần lấy từ EntityAccounts
      let finalReceiverEntityAccountId = receiverEntityAccountId;
      if (receiver && !finalReceiverEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, receiver)
            .query(`
              SELECT TOP 1 EntityAccountId
              FROM EntityAccounts
              WHERE EntityType = 'Account' AND EntityId = @AccountId
            `);
          if (result.recordset.length > 0) {
            finalReceiverEntityAccountId = result.recordset[0].EntityAccountId;
          }
        } catch (err) {
          console.warn('[NotificationService] Could not get receiverEntityAccountId:', err);
        }
      }

      // Nếu có sender (AccountId) nhưng chưa có senderEntityAccountId, cần lấy từ EntityAccounts
      let finalSenderEntityAccountId = senderEntityAccountId;
      if (sender && !finalSenderEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, sender)
            .query(`
              SELECT TOP 1 EntityAccountId
              FROM EntityAccounts
              WHERE EntityType = 'Account' AND EntityId = @AccountId
            `);
          if (result.recordset.length > 0) {
            finalSenderEntityAccountId = result.recordset[0].EntityAccountId;
          }
        } catch (err) {
          console.warn('[NotificationService] Could not get senderEntityAccountId:', err);
        }
      }

      if (!finalReceiverEntityAccountId) {
        console.warn('[NotificationService] Could not determine receiverEntityAccountId');
        return;
      }

      // Normalize GUIDs to lowercase for consistency
      const normalizedReceiverEntityAccountId = String(finalReceiverEntityAccountId).trim().toLowerCase();
      const normalizedSenderEntityAccountId = finalSenderEntityAccountId 
        ? String(finalSenderEntityAccountId).trim().toLowerCase() 
        : null;

      const notification = new Notification({
        type: type || "Info",
        sender: sender || null,
        senderEntityAccountId: normalizedSenderEntityAccountId,
        receiver: receiver || null,
        receiverEntityAccountId: normalizedReceiverEntityAccountId,
        content: content || "",
        link: link || "/",
        status: "Unread"
      });

      await notification.save();
      console.log('[NotificationService] Notification created:', notification._id);

      // Emit socket event for real-time notification update
      try {
        const io = getIO();
        const notificationPayload = {
          notificationId: notification._id.toString(),
          type: notification.type,
          senderEntityAccountId: notification.senderEntityAccountId,
          receiverEntityAccountId: notification.receiverEntityAccountId,
          content: notification.content,
          link: notification.link,
          status: notification.status,
          createdAt: notification.createdAt
        };
        
        const receiverRoom = normalizedReceiverEntityAccountId;
        io.to(receiverRoom).emit('new_notification', notificationPayload);
        console.log('[NotificationService] Emitted new_notification to room:', receiverRoom);
      } catch (socketError) {
        console.warn('[NotificationService] Could not emit socket event:', socketError.message);
      }
    } catch (error) {
      console.error('[NotificationService] Error creating notification:', error);
      throw error;
    }
  }

}

module.exports = new NotificationService();
