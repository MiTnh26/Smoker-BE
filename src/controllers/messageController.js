const Conversation = require("../models/conversationModel");
const Message = require("../models/messageModel");
const Participant = require("../models/participantModel");
const mongoose = require("mongoose");
const { getIO } = require('../utils/socket');
const { getEntityAccountIdByAccountId, getAllEntityAccountIdsForAccount, normalizeParticipant } = require("../models/entityAccountModel");
const { getPool } = require("../db/sqlserver");
const sql = require('mssql');

// Helper function to check if an entity is banned
async function checkEntityBanned(pool, entityAccountId) {
  try {
    if (!entityAccountId) return false;

    // Check BusinessAccount
    const businessCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 ba.Status 
        FROM BussinessAccounts ba
        INNER JOIN EntityAccounts ea ON ea.EntityId = ba.BussinessAccountId AND ea.EntityType = 'BusinessAccount'
        WHERE ea.EntityAccountId = @EntityAccountId AND ba.Status = 'banned'
      `);
    if (businessCheck.recordset.length > 0) return true;
    
    // Check BarPage
    const barCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 bp.Status 
        FROM BarPages bp
        INNER JOIN EntityAccounts ea ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
        WHERE ea.EntityAccountId = @EntityAccountId AND bp.Status = 'banned'
      `);
    if (barCheck.recordset.length > 0) return true;
    
    // Check Account (Customer)
    const accountCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 a.Status 
        FROM Accounts a
        INNER JOIN EntityAccounts ea ON ea.EntityId = a.AccountId AND ea.EntityType = 'Account'
        WHERE ea.EntityAccountId = @EntityAccountId AND a.Status = 'banned'
      `);
    if (accountCheck.recordset.length > 0) return true;
    
    return false;
  } catch (err) {
    console.error("[checkEntityBanned] Error:", err);
    return false; // Fail safe
  }
}

// Helper function to get entity status
async function getEntityStatus(pool, entityAccountId) {
  try {
    if (!entityAccountId) return 'active';

    // Check BusinessAccount
    const businessCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 ba.Status 
        FROM BussinessAccounts ba
        INNER JOIN EntityAccounts ea ON ea.EntityId = ba.BussinessAccountId AND ea.EntityType = 'BusinessAccount'
        WHERE ea.EntityAccountId = @EntityAccountId
      `);
    if (businessCheck.recordset.length > 0) {
      return businessCheck.recordset[0].Status;
    }
    
    // Check BarPage
    const barCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 bp.Status 
        FROM BarPages bp
        INNER JOIN EntityAccounts ea ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
        WHERE ea.EntityAccountId = @EntityAccountId
      `);
    if (barCheck.recordset.length > 0) {
      return barCheck.recordset[0].Status;
    }
    
    // Check Account (Customer)
    const accountCheck = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT TOP 1 a.Status 
        FROM Accounts a
        INNER JOIN EntityAccounts ea ON ea.EntityId = a.AccountId AND ea.EntityType = 'Account'
        WHERE ea.EntityAccountId = @EntityAccountId
      `);
    if (accountCheck.recordset.length > 0) {
      return accountCheck.recordset[0].Status;
    }
    
    return 'active'; // Default
  } catch (err) {
    console.error("[getEntityStatus] Error:", err);
    return 'active'; // Fail safe
  }
}

class MessageController {
  // Tạo hoặc lấy cuộc trò chuyện giữa 2 user
  async getOrCreateConversation(req, res) {
    try {
      const { participant1Id, participant2Id } = req.body;
      if (!participant1Id || !participant2Id) {
        return res.status(400).json({ success: false, message: "Missing participant ids" });
      }
      
      // Prevent self-messaging
      const p1 = String(participant1Id).toLowerCase().trim();
      const p2 = String(participant2Id).toLowerCase().trim();
      if (p1 === p2) {
        return res.status(400).json({ success: false, message: "Cannot create conversation with yourself" });
      }
      
      // Check if either participant is banned
      const pool = await getPool();
      const [p1Banned, p2Banned] = await Promise.all([
        checkEntityBanned(pool, participant1Id),
        checkEntityBanned(pool, participant2Id)
      ]);

      if (p1Banned || p2Banned) {
        return res.status(403).json({ 
          success: false, 
          message: "Không thể tạo cuộc trò chuyện với tài khoản này" 
        });
      }
      
      const participants = [String(participant1Id), String(participant2Id)];
      
      // Find conversation by participants (order-independent)
      let conversation = await Conversation.findOne({
        participants: { $all: participants, $size: 2 },
        type: "single"
      });
      
      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          type: "single",
          participants: participants,
          last_message_id: null,
          last_message_content: "",
          last_message_time: null,
        });
        await conversation.save();
        
        // Create participant documents
        for (const participantId of participants) {
          await Participant.create({
            conversation_id: conversation._id,
            user_id: participantId,
            last_read_message_id: null,
            last_read_at: null,
          });
        }
      }
      
      res.status(200).json({ success: true, data: conversation, message: "Conversation found/created" });
    } catch (error) {
      console.error('Error in getOrCreateConversation:', error);
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Lấy danh sách cuộc trò chuyện của user
  async getUserConversations(req, res) {
    try {
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      const requestedEntityAccountId = req.query?.entityAccountId;
      let entityAccountIds = [];
      
      const pool = await getPool();
      
      if (requestedEntityAccountId) {
        entityAccountIds = [requestedEntityAccountId];
      } else {
        const allEntityAccounts = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId`);
        entityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
      }
      
      if (entityAccountIds.length === 0) {
        const accountEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        entityAccountIds = [accountEntityAccountId];
      }
      
      // Normalize entityAccountIds for comparison
      const entityAccountIdsNormalized = entityAccountIds.map(id => normalizeParticipant(id));
      
      // Find conversations where user is a participant
      const conversations = await Conversation.find({
        participants: { $in: entityAccountIds }
      })
      .sort({ last_message_time: -1, updatedAt: -1 })
      .lean();
      
      // Get participants and unread counts for each conversation
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
          // Get other participants (not the current user) - normalize for comparison but keep original format
          const otherParticipants = conv.participants.filter(p => {
            const pNormalized = normalizeParticipant(p);
            return !entityAccountIdsNormalized.includes(pNormalized);
          }).map(p => String(p).trim()); // Keep original format for database queries
          
          // Get participant statuses
          const participantStatuses = {};
          for (const participantId of conv.participants) {
            participantStatuses[participantId] = await getEntityStatus(pool, participantId);
          }
          
          // Get unread count for current user
          // Use original format from entityAccountIds for Participant query
          const currentUserParticipant = await Participant.findOne({
            conversation_id: conv._id,
            user_id: { $in: entityAccountIds }
          }).lean();
          
          let unreadCount = 0;
          if (currentUserParticipant && currentUserParticipant.last_read_message_id) {
            unreadCount = await Message.countDocuments({
              conversation_id: conv._id,
              _id: { $gt: currentUserParticipant.last_read_message_id },
              sender_id: { $in: otherParticipants }
            });
          } else {
            // If no last_read_message_id, count all messages from others
            unreadCount = await Message.countDocuments({
              conversation_id: conv._id,
              sender_id: { $in: otherParticipants }
            });
          }
          
          return {
            ...conv,
            participantStatuses,
            unreadCount,
            otherParticipants
          };
        })
      );
      
      res.status(200).json({ success: true, data: enrichedConversations, message: "Conversations retrieved successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Gửi tin nhắn
  async sendMessage(req, res) {
    try {
      const { conversationId, content, messageType = "text", senderEntityAccountId: requestedSenderEntityAccountId, entityType, entityId, postId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId || !conversationId || !content) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      let conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      let senderEntityAccountId = null;
      let senderEntityType = null;
      const pool = await getPool();
      
      if (entityType || entityId) {
        try {
          if (entityType && entityId) {
            let dbEntityType = entityType;
            if (entityType === "Business") dbEntityType = "BusinessAccount";
            else if (entityType === "Account") dbEntityType = "Account";
            else if (entityType === "BarPage") dbEntityType = "BarPage";
            
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityType", sql.NVarChar, dbEntityType)
              .input("EntityId", sql.UniqueIdentifier, entityId)
              .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId AND EntityType = @EntityType AND EntityId = @EntityId`);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              senderEntityType = dbEntityType;
            }
          } else if (entityId) {
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityId", sql.UniqueIdentifier, entityId)
              .query(`SELECT EntityAccountId, EntityType FROM EntityAccounts WHERE AccountId = @AccountId AND EntityId = @EntityId`);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              senderEntityType = entityAccountQuery.recordset[0].EntityType;
            }
          } else if (entityType) {
            let dbEntityType = entityType;
            if (entityType === "Business") dbEntityType = "BusinessAccount";
            else if (entityType === "Account") dbEntityType = "Account";
            else if (entityType === "BarPage") dbEntityType = "BarPage";
            
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityType", sql.NVarChar, dbEntityType)
              .query(`SELECT TOP 1 EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId AND EntityType = @EntityType`);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              senderEntityType = dbEntityType;
            }
          }
        } catch (error) {
          console.error('Error finding EntityAccountId from entityType/entityId:', error);
        }
      }
      
      if (!senderEntityAccountId && requestedSenderEntityAccountId) {
        try {
          const validationQuery = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .input("EntityAccountId", sql.UniqueIdentifier, requestedSenderEntityAccountId)
            .query(`SELECT EntityAccountId, EntityType FROM EntityAccounts WHERE AccountId = @AccountId AND EntityAccountId = @EntityAccountId`);
          
          if (validationQuery.recordset.length > 0) {
            senderEntityAccountId = String(requestedSenderEntityAccountId);
            senderEntityType = validationQuery.recordset[0].EntityType;
          }
        } catch (error) {
          console.error('Error validating senderEntityAccountId from request:', error);
        }
      }
      
      if (!senderEntityAccountId) {
        try {
          const allEntityAccounts = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .query(`SELECT EntityAccountId, EntityType FROM EntityAccounts WHERE AccountId = @AccountId`);
          
          const allEntityAccountIds = allEntityAccounts.recordset.map(r => ({
            id: String(r.EntityAccountId),
            type: r.EntityType
          }));
          
          // Find sender from conversation participants
          const found = allEntityAccountIds.find(ea => 
            conversation.participants.includes(ea.id)
          );
          
          if (found) {
            senderEntityAccountId = found.id;
            senderEntityType = found.type;
          } else {
            senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
          }
        } catch (error) {
          console.error('Error finding EntityAccountId from conversation, using fallback:', error);
          senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        }
      }
      
      // Handle post sharing - fetch post details if postId is provided
      let postData = null;
      if (postId) {
        try {
          const postService = require("../services/postService");
          const postResult = await postService.getPostById(postId, true, false, {});
          
          if (postResult && postResult.success !== false && postResult.data) {
            const post = postResult.data;
            
            // Get first image from medias or images field
            let postImage = null;
            if (post.medias && Array.isArray(post.medias) && post.medias.length > 0) {
              const firstImage = post.medias.find(m => m.type === 'image' || !m.type || m.type === 'image');
              if (firstImage) {
                postImage = firstImage.url;
              } else if (post.medias[0]) {
                postImage = post.medias[0].url;
              }
            } else if (post.images) {
              postImage = typeof post.images === 'string' ? post.images : (post.images[0] || null);
            }
            
            // Get author info
            let postAuthorName = "Người dùng";
            let postAuthorAvatar = null;
            
            if (post.entityAccountId) {
              try {
                const authorQuery = await pool.request()
                  .input("EntityAccountId", sql.UniqueIdentifier, post.entityAccountId)
                  .query(`
                    SELECT TOP 1 
                      a.UserName,
                      a.Avatar,
                      bp.BarName,
                      bp.Avatar as BarAvatar,
                      ba.UserName as BusinessName,
                      ba.Avatar as BusinessAvatar
                    FROM EntityAccounts ea
                    LEFT JOIN Accounts a ON ea.EntityId = a.AccountId AND ea.EntityType = 'Account'
                    LEFT JOIN BarPages bp ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
                    LEFT JOIN BussinessAccounts ba ON ea.EntityId = ba.BussinessAccountId AND ea.EntityType = 'BusinessAccount'
                    WHERE ea.EntityAccountId = @EntityAccountId
                  `);
                
                if (authorQuery.recordset.length > 0) {
                  const row = authorQuery.recordset[0];
                  postAuthorName = row.UserName || row.BarName || row.BusinessName || postAuthorName;
                  postAuthorAvatar = row.Avatar || row.BarAvatar || row.BusinessAvatar || null;
                }
              } catch (err) {
                console.warn('[MessageController] Error getting post author info:', err);
              }
            }
            
            // Create summary from content or title
            const postContent = post.content || post.title || "";
            const postSummary = postContent.length > 150 
              ? postContent.substring(0, 150) + "..." 
              : postContent;
            
            postData = {
              post_id: String(postId),
              post_summary: postSummary,
              post_image: postImage,
              post_author_name: postAuthorName,
              post_author_avatar: postAuthorAvatar,
              post_title: post.title || null,
              post_content: post.content || null,
            };
          }
        } catch (error) {
          console.error('[MessageController] Error fetching post data:', error);
          // Continue without post data if fetch fails
        }
      }
      
      // Create new message document
      const message = new Message({
        conversation_id: conversation._id,
        sender_id: senderEntityAccountId,
        sender_entity_type: senderEntityType,
        content: content,
        message_type: messageType,
        is_story_reply: req.body.isStoryReply || false,
        story_id: req.body.storyId || null,
        story_url: req.body.storyUrl || null,
        is_post_share: !!postId,
        post_id: postData?.post_id || null,
        post_summary: postData?.post_summary || null,
        post_image: postData?.post_image || null,
        post_author_name: postData?.post_author_name || null,
        post_author_avatar: postData?.post_author_avatar || null,
        post_title: postData?.post_title || null,
        post_content: postData?.post_content || null,
      });
      
      await message.save();

      // Update conversation with last message info
      conversation.last_message_id = message._id;
      conversation.last_message_content = content;
      conversation.last_message_time = message.createdAt;
      await conversation.save();

      // Get receiver ID - normalize both sides for comparison using helper function
      const senderEntityAccountIdNormalized = normalizeParticipant(senderEntityAccountId);
      const receiverId = conversation.participants.find(p => {
        const pNormalized = normalizeParticipant(p);
        return pNormalized && pNormalized !== senderEntityAccountIdNormalized;
      });
      
      // Create notification for receiver only if receiverId is found
      if (receiverId) {
      try {
        const notificationService = require("../services/notificationService");
        const { t } = require("../utils/translation");
        const pool = await getPool();
        
        // Get sender name (fallback to "Someone")
        let senderName = t('common.someone', 'vi'); // Default fallback
        try {
          const senderQuery = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
            .query(`
              SELECT TOP 1 
                a.UserName,
                bp.BarName,
                ba.BusinessName
              FROM EntityAccounts ea
              LEFT JOIN Accounts a ON ea.EntityId = a.AccountId AND ea.EntityType = 'Account'
              LEFT JOIN BarPages bp ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
              LEFT JOIN BussinessAccounts ba ON ea.EntityId = ba.BussinessAccountId AND ea.EntityType = 'BusinessAccount'
              WHERE ea.EntityAccountId = @EntityAccountId
            `);
          
          if (senderQuery.recordset.length > 0) {
            const row = senderQuery.recordset[0];
            senderName = row.UserName || row.BarName || row.BusinessName || senderName;
          }
        } catch (err) {
          console.warn('[MessageController] Error getting sender name:', err);
        }
        
        // Create notification with raw data (no translation)
        // Frontend will handle translation based on user's locale
        const messagePreview = content.length > 50 
          ? content.substring(0, 50) + "..." 
          : content;
        
          // Normalize receiverId to string
          const receiverEntityAccountId = String(receiverId).trim();
          
          const notificationResult = await notificationService.createMessageNotification(
          senderEntityAccountId,
            receiverEntityAccountId,
          senderName,
          messagePreview,
          conversationId.toString()
        );
          
          // Emit notification event for message notification (since notificationService skips it for Messages type)
          if (notificationResult && notificationResult.success && notificationResult.data) {
            try {
              const io = getIO();
              if (io) {
                const receiverRoom = String(receiverEntityAccountId).trim();
                // Emit a custom event that frontend can listen to for updating message count
                io.to(receiverRoom).emit("message_notification_created", {
                  notification: notificationResult.data,
                  conversationId: conversationId.toString(),
                  senderId: senderEntityAccountId
                });
              }
            } catch (emitError) {
              console.error('[MessageController] Error emitting message notification event:', emitError);
            }
          }
      } catch (notificationError) {
        console.error('[MessageController] Error creating notification:', notificationError);
        // Don't fail the request if notification creation fails
        }
      } else {
        console.warn('[MessageController] Could not find receiverId for notification. Participants:', conversation.participants, 'Sender:', senderEntityAccountId);
      }
      
      // Emit socket event for real-time message update
      try {
        const io = getIO();
        const conversationRoom = `conversation:${conversationId}`;
        
        const messagePayload = { 
          conversationId: conversationId.toString(),
          messageId: message._id.toString(),
          sender_id: senderEntityAccountId,
          content: content,
          message_type: messageType,
          is_story_reply: message.is_story_reply,
          story_id: message.story_id,
          story_url: message.story_url,
          is_post_share: message.is_post_share,
          post_id: message.post_id,
          post_summary: message.post_summary,
          post_image: message.post_image,
          post_author_name: message.post_author_name,
          post_author_avatar: message.post_author_avatar,
          post_title: message.post_title,
          post_content: message.post_content,
          createdAt: message.createdAt,
        };
        
        // Emit to conversation room
        io.to(conversationRoom).emit('new_message', messagePayload);
        
        // Emit to receiver's EntityAccountId room if receiverId is found
        if (receiverId) {
          const receiverIdStr = String(receiverId).trim();
        io.to(receiverIdStr).emit('new_message', messagePayload);
        }
      } catch (e) {
        console.error('Error emitting socket message:', e);
      }

      res.status(201).json({ 
        success: true, 
        data: { 
          messageId: message._id.toString(), 
          content, 
          senderId: senderEntityAccountId, 
          messageType 
        }, 
        message: "Message sent" 
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Lấy danh sách tin nhắn của 1 cuộc trò chuyện
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const accountId = req.user?.id;
      const { limit = 50, offset = 0, before } = req.query; // Pagination support
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      // Check if user is a participant - use helper function for consistency
      let isParticipant = false;
      try {
        const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(accountId);
        isParticipant = conversation.participants.some(p => {
          const pNormalized = normalizeParticipant(p);
          return allUserEntityAccountIds.includes(pNormalized);
        });
      } catch (error) {
        console.error('Error checking participant status:', error);
      }
      
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      // Get current user's entityAccountIds
      const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(accountId);
      
      // Get participant info to retrieve last_read_message_id
      const currentUserParticipant = await Participant.findOne({
        conversation_id: conversation._id,
        user_id: { $in: allUserEntityAccountIds }
      }).lean();

      // Build query with pagination
      const query = { conversation_id: conversation._id };
      if (before && mongoose.Types.ObjectId.isValid(before)) {
        query._id = { $lt: new mongoose.Types.ObjectId(before) };
      }

      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(offset))
        .lean();

      // Reverse to show oldest first (or keep newest first based on frontend preference)
      const sortedMessages = messages.reverse();

      res.status(200).json({ 
        success: true, 
        data: sortedMessages, 
        message: "Messages retrieved",
        last_read_message_id: currentUserParticipant?.last_read_message_id || null,
        last_read_at: currentUserParticipant?.last_read_at || null,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: messages.length === parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error in getMessages:', error);
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markMessagesRead(req, res) {
    try {
      const { conversationId, lastMessageId, entityAccountId: requestedEntityAccountId } = req.body;
      const accountId = req.user?.id;
      if (!accountId || !conversationId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      // BẮT BUỘC phải có entityAccountId từ request body hoặc query
      // KHÔNG fallback về AccountId để tránh nhầm lẫn
      const entityAccountIdFromQuery = req.query?.entityAccountId;
      const entityAccountId = requestedEntityAccountId || entityAccountIdFromQuery;
      
      if (!entityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required in request body or query. Cannot use AccountId to avoid confusion between roles."
        });
      }
      
      const normalizedEntityAccountId = normalizeParticipant(entityAccountId);
      
      if (!normalizedEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "Invalid entityAccountId provided."
        });
      }
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      // Verify entityAccountId belongs to the logged-in user's AccountId (supports multi-role)
      const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(accountId);
      
      if (allUserEntityAccountIds.length === 0 || !allUserEntityAccountIds.includes(normalizedEntityAccountId)) {
        return res.status(403).json({
          success: false,
          message: "EntityAccountId does not belong to the authenticated user."
        });
      }
      
      // Verify entityAccountId is a participant in this conversation (normalize both sides)
      const participantsNormalized = conversation.participants.map(p => normalizeParticipant(p));
      if (!participantsNormalized.includes(normalizedEntityAccountId)) {
        return res.status(403).json({
          success: false,
          message: "EntityAccountId is not a participant in this conversation."
        });
      }
      
      // Determine last message ID to mark as read
      let lastReadMessageId = null;
      if (lastMessageId && mongoose.Types.ObjectId.isValid(lastMessageId)) {
        lastReadMessageId = new mongoose.Types.ObjectId(lastMessageId);
      } else {
        // If not provided, use the last message in conversation
        const lastMessage = await Message.findOne({ conversation_id: conversation._id })
          .sort({ createdAt: -1 });
        if (lastMessage) {
          lastReadMessageId = lastMessage._id;
        }
      }
      
      // (A) Update participant's last_read_message_id
      // Find the original format from conversation.participants to ensure exact match
      const normalizedForComparison = normalizeParticipant(entityAccountId);
      const originalParticipantId = conversation.participants.find(p => 
        normalizeParticipant(p) === normalizedForComparison
      ) || String(entityAccountId).trim();
      const entityAccountIdForDB = String(originalParticipantId).trim();
      
      await Participant.findOneAndUpdate(
        {
          conversation_id: conversation._id,
          user_id: entityAccountIdForDB,
        },
        {
          $set: {
            last_read_message_id: lastReadMessageId,
            last_read_at: new Date(),
          },
        },
        { upsert: true, new: true }
      );
      
      // (B) Mark related notifications as read
      try {
        const Notification = require("../models/notificationModel");
        
        // Get other participants (senders) - normalize for comparison
        // Note: MongoDB query will match regardless of case, but we normalize for consistency
        const otherParticipants = conversation.participants
          .filter(p => {
            const pNormalized = normalizeParticipant(p);
            return pNormalized && pNormalized !== normalizedEntityAccountId;
          })
          .map(p => String(p).trim()); // Keep original format for query (MongoDB stores as-is)
        
        if (otherParticipants.length > 0) {
          // Mark notifications from the other participants in this specific conversation as read.
          // Use original format for both receiver and sender to match how notifications are stored
          const receiverEntityAccountIdForQuery = String(entityAccountId).trim();
          
          await Notification.updateMany(
            {
              type: "Messages",
              receiverEntityAccountId: receiverEntityAccountIdForQuery, // Use original format to match stored format
              senderEntityAccountId: { $in: otherParticipants }, // The users who sent the messages
              status: "Unread",
            },
            { status: "Read" }
          );
          
          console.log(`[MessageController] Marked message notifications as read for conversation ${conversationId}.`, {
            receiver: receiverEntityAccountIdForQuery,
            senders: otherParticipants
          });
        }
      } catch (notificationError) {
        console.error('[MessageController] Error marking notifications as read:', notificationError);
        // Don't fail the request if notification update fails
      }
      
      res.status(200).json({ success: true, message: "Messages marked as read" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }
}

module.exports = new MessageController();
