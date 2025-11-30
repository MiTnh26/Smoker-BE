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
// Lấy tổng số tin nhắn chưa đọc từ tất cả người dùng khác
  async getTotalUnreadMessagesCount(req, res) {
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
      }).lean();
      
      let totalUnreadCount = 0;
      
      // Calculate total unread count
      for (const conv of conversations) {
        // Get other participants (not the current user) - normalize for comparison but keep original format
        const otherParticipants = conv.participants.filter(p => {
          const pNormalized = normalizeParticipant(p);
          return !entityAccountIdsNormalized.includes(pNormalized);
        }).map(p => String(p).trim()); // Keep original format for database queries
        
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
        
        totalUnreadCount += unreadCount;
      }
      
      res.status(200).json({ 
        success: true, 
        data: { totalUnreadCount }, 
        message: "Total unread messages count retrieved successfully" 
      });
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
      
      // Validate postId format if provided
      let validPostId = null;
      if (postId) {
        const postIdStr = String(postId).trim();
        // Validate MongoDB ObjectId format (24 hex characters)
        if (mongoose.Types.ObjectId.isValid(postIdStr)) {
          validPostId = postIdStr;
        } else {
          console.warn('[MessageController] Invalid postId format:', postIdStr);
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
        is_post_share: !!validPostId,
        post_id: validPostId,
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
      
      // Không tạo notification cho messages - messages có unread count riêng trong conversation
      
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
    
      // console.log('[DEBUG getMessages] allUserEntityAccountIds:', allUserEntityAccountIds);
      // console.log('[DEBUG getMessages] conversation._id:', conversation._id);
      
      const allUserEntityAccountIdsUpper = allUserEntityAccountIds.map(id => id.toUpperCase());
      
      // Get participant info to retrieve last_read_message_id
      const currentUserParticipant = await Participant.findOne({
        conversation_id: conversation._id,
        user_id: { $in: allUserEntityAccountIdsUpper }
      }).lean();
      
      // Get other participant's last_read_message_id (để hiển thị "đã xem" cho message của mình)
      let otherParticipantLastReadMessageId = null;
      let otherParticipantLastReadAt = null;
      
      // Find other participant (không phải current user)
      const currentUserEntityAccountIdsNormalized = allUserEntityAccountIds.map(id => normalizeParticipant(id));
      const otherParticipants = conversation.participants.filter(p => {
        const pNormalized = normalizeParticipant(p);
        return !currentUserEntityAccountIdsNormalized.includes(pNormalized);
      });
      
      if (otherParticipants.length > 0) {
        // Get participant của đối phương (dùng format gốc từ conversation.participants)
        const otherParticipantId = String(otherParticipants[0]).trim();
        const otherParticipant = await Participant.findOne({
          conversation_id: conversation._id,
          user_id: otherParticipantId
        }).lean();
        
        if (otherParticipant) {
          otherParticipantLastReadMessageId = otherParticipant.last_read_message_id;
          otherParticipantLastReadAt = otherParticipant.last_read_at;
        }
      }
      
      // console.log('[DEBUG getMessages] currentUserParticipant:', currentUserParticipant);
      // console.log('[DEBUG getMessages] last_read_message_id:', currentUserParticipant?.last_read_message_id);
      // console.log('[DEBUG getMessages] last_read_at:', currentUserParticipant?.last_read_at);
      // console.log('[DEBUG getMessages] otherParticipantLastReadMessageId:', otherParticipantLastReadMessageId);

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
        entityAccountReadId: sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1].sender_id : null,
        last_read_message_id: currentUserParticipant?.last_read_message_id || null,  // Của current user
        last_read_at: currentUserParticipant?.last_read_at || null,
        other_participant_last_read_message_id: otherParticipantLastReadMessageId,  // Của đối phương (để hiển thị "đã xem")
        other_participant_last_read_at: otherParticipantLastReadAt,
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
      
      // QUAN TRỌNG: last_read_message_id CHỈ lưu message_id của ĐỐI PHƯƠNG
      // KHÔNG bao giờ lưu message_id của chính user đó
      // Nếu message cuối cùng là của chính user → KHÔNG update (giữ nguyên giá trị cũ)
      
      const readerEntityAccountId = String(entityAccountId).trim().toLowerCase();
      
      // Tìm đối phương (không phải current user)
      const otherParticipants = conversation.participants.filter(p => {
        const pNormalized = normalizeParticipant(p);
        return pNormalized && pNormalized !== normalizeParticipant(entityAccountId);
      });
      
      if (otherParticipants.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot find other participant in conversation"
        });
      }
      
      // Tìm message cuối cùng của ĐỐI PHƯƠNG (không phải của chính user)
      const lastMessageFromOther = await Message.findOne({
        conversation_id: conversation._id,
        sender_id: { $in: otherParticipants }  // Chỉ lấy message của đối phương
      }).sort({ createdAt: -1 });
      
      if (!lastMessageFromOther) {
        // Không có message nào từ đối phương → không cần update
        return res.status(200).json({ 
          success: true, 
          message: "No messages from other participant to mark as read",
          skipped: true
        });
      }
      
      // Validate: Đảm bảo message không phải của chính user (double check)
      const lastMessageSenderId = String(lastMessageFromOther.sender_id).trim().toLowerCase();
      if (lastMessageSenderId === readerEntityAccountId) {
        console.log('[MessageController] ERROR: Found own message when filtering by other participants', {
          reader: readerEntityAccountId,
          sender: lastMessageSenderId,
          messageId: lastMessageFromOther._id
        });
        return res.status(200).json({ 
          success: true, 
          message: "Cannot mark own message as read",
          skipped: true,
          reason: "Last message from other participant is actually from the reader"
        });
      }
      
      // Nếu có lastMessageId trong request, validate nó là message của đối phương
      let lastReadMessageId = lastMessageFromOther._id;
      
      if (lastMessageId && mongoose.Types.ObjectId.isValid(lastMessageId)) {
        const requestedMessage = await Message.findById(lastMessageId);
        if (requestedMessage) {
          // Validate: Message phải thuộc conversation này
          if (requestedMessage.conversation_id.toString() !== conversation._id.toString()) {
            return res.status(400).json({
              success: false,
              message: "Requested message does not belong to this conversation"
            });
          }
          
          const requestedSenderId = String(requestedMessage.sender_id).trim().toLowerCase();
          
          // QUAN TRỌNG: Chỉ cho phép mark message của đối phương
          if (requestedSenderId === readerEntityAccountId) {
            return res.status(400).json({
              success: false,
              message: "Cannot mark own message as read",
              reason: "Requested message is from the reader"
            });
          }
          
          // Validate: Message phải là của đối phương (trong danh sách otherParticipants)
          const requestedSenderNormalized = normalizeParticipant(requestedMessage.sender_id);
          const otherParticipantsNormalized = otherParticipants.map(p => normalizeParticipant(p));
          
          if (!otherParticipantsNormalized.includes(requestedSenderNormalized)) {
            return res.status(400).json({
              success: false,
              message: "Requested message is not from other participant",
              reason: "Message sender is not in other participants list"
            });
          }
          
          // Nếu message được request là của đối phương và <= lastMessageFromOther → OK
          if (requestedMessage.createdAt <= lastMessageFromOther.createdAt) {
            lastReadMessageId = requestedMessage._id;
          }
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
      
      // Emit socket event để thông báo đối phương biết đã đọc message
      try {
        const io = getIO();
        const conversationRoom = `conversation:${conversationId}`;
        
        // Emit đến conversation room (cho real-time update)
        io.to(conversationRoom).emit('messages_read', {
          conversationId: conversationId.toString(),
          readerEntityAccountId: entityAccountId,
          last_read_message_id: lastReadMessageId.toString(),
          last_read_at: new Date()
        });
        
        // Emit đến đối phương (để cập nhật "đã xem" cho message của họ)
        for (const otherParticipantId of otherParticipants) {
          const otherParticipantIdStr = String(otherParticipantId).trim();
          io.to(otherParticipantIdStr).emit('messages_read', {
            conversationId: conversationId.toString(),
            readerEntityAccountId: entityAccountId,
            last_read_message_id: lastReadMessageId.toString(),
            last_read_at: new Date()
          });
        }
        
        console.log('[MessageController] Emitted messages_read event', {
          conversationId: conversationId.toString(),
          reader: entityAccountId,
          lastReadMessageId: lastReadMessageId.toString()
        });
      } catch (socketError) {
        console.warn('[MessageController] Could not emit socket event for messages_read:', socketError.message);
        // Không fail request nếu socket emit lỗi
      }
      
      // Không cần mark notifications as read - messages không dùng notification
      
      res.status(200).json({ success: true, message: "Messages marked as read" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }
}

module.exports = new MessageController();
