
const Message = require("../models/messageDocument");
const mongoose = require("mongoose");
const { getIO } = require('../utils/socket');
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool } = require("../db/sqlserver");
const sql = require('mssql');

class MessageController {
  // Tạo hoặc lấy cuộc trò chuyện giữa 2 user
  async getOrCreateConversation(req, res) {
    try {
      const { participant1Id, participant2Id } = req.body;
      if (!participant1Id || !participant2Id) {
        return res.status(400).json({ success: false, message: "Missing participant ids" });
      }
      
      // Prevent self-messaging: check if both participants are the same
      const p1 = String(participant1Id).toLowerCase().trim();
      const p2 = String(participant2Id).toLowerCase().trim();
      if (p1 === p2) {
        return res.status(400).json({ success: false, message: "Cannot create conversation with yourself" });
      }
      
      console.log('=== CREATE CONVERSATION DEBUG ===');
      console.log('Participant 1 (from frontend):', participant1Id);
      console.log('Participant 2 (from frontend):', participant2Id);
      
      let conversation = await Message.findOne({
        $or: [
          { "Người 1": participant1Id, "Người 2": participant2Id },
          { "Người 1": participant2Id, "Người 2": participant1Id }
        ]
      });
      if (!conversation) {
        conversation = new Message({
          "Người 1": String(participant1Id),
          "Người 2": String(participant2Id),
          "Cuộc Trò Chuyện": {}
        });
        await conversation.save();
        console.log('Created new conversation with IDs:', String(participant1Id), String(participant2Id));
      } else {
        console.log('Found existing conversation');
      }
      console.log('========================');
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
      
      // Get EntityAccountId from query param if provided (for specific role)
      const requestedEntityAccountId = req.query?.entityAccountId;
      
      let entityAccountIds = [];
      
      if (requestedEntityAccountId) {
        // If specific EntityAccountId is requested, use only that one
        entityAccountIds = [requestedEntityAccountId];
      } else {
        // Otherwise, get all EntityAccountIds for this AccountId (all roles)
        const { getPool, sql } = require("../db/sqlserver");
        const pool = await getPool();
        const allEntityAccounts = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`
            SELECT EntityAccountId 
            FROM EntityAccounts 
            WHERE AccountId = @AccountId
          `);
        entityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
      }
      
      if (entityAccountIds.length === 0) {
        // Fallback to Account EntityAccountId
        const accountEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        entityAccountIds = [accountEntityAccountId];
      }
      
      // Query conversations for all EntityAccountIds
      const conversations = await Message.find({
        $or: [
          { "Người 1": { $in: entityAccountIds } },
          { "Người 2": { $in: entityAccountIds } }
        ]
      }).sort({ updatedAt: -1 });
      
      res.status(200).json({ success: true, data: conversations, message: "Conversations retrieved successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Gửi tin nhắn
  async sendMessage(req, res) {
    try {
      const { conversationId, content, messageType = "text", senderEntityAccountId: requestedSenderEntityAccountId, entityType, entityId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId || !conversationId || !content) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      // Lấy conversation trước để biết participants
      let conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      // Tìm đúng EntityAccountId từ conversation (hỗ trợ cả Account và role như BarPage/BusinessAccount)
      // Priority: Use entityType + entityId (or just entityId) to find EntityAccountId > Use senderEntityAccountId from request > Find from conversation > Fallback to Account EntityAccountId
      let senderEntityAccountId = null;
      
      // Priority 1: If frontend provided entityType and/or entityId, use them to find EntityAccountId
      if (entityType || entityId) {
        try {
          const pool = await getPool();
          
          // If both entityType and entityId provided, use both (most accurate)
          if (entityType && entityId) {
            // Map entityType to EntityType in database
            let dbEntityType = entityType;
            if (entityType === "Business") {
              dbEntityType = "BusinessAccount";
            } else if (entityType === "Account") {
              dbEntityType = "Account";
            } else if (entityType === "BarPage") {
              dbEntityType = "BarPage";
            }
            
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityType", sql.NVarChar, dbEntityType)
              .input("EntityId", sql.UniqueIdentifier, entityId)
              .query(`
                SELECT EntityAccountId 
                FROM EntityAccounts 
                WHERE AccountId = @AccountId AND EntityType = @EntityType AND EntityId = @EntityId
              `);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              console.log('✅ Using EntityAccountId from entityType + entityId:', senderEntityAccountId, 'for', entityType, entityId);
            }
          }
          // If only entityId provided, find by AccountId + EntityId (EntityId is unique per AccountId)
          else if (entityId) {
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityId", sql.UniqueIdentifier, entityId)
              .query(`
                SELECT EntityAccountId 
                FROM EntityAccounts 
                WHERE AccountId = @AccountId AND EntityId = @EntityId
              `);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              console.log('✅ Using EntityAccountId from entityId:', senderEntityAccountId, 'for entityId:', entityId);
            }
          }
          // If only entityType provided, find first matching EntityAccountId (less accurate, but better than nothing)
          else if (entityType) {
            let dbEntityType = entityType;
            if (entityType === "Business") {
              dbEntityType = "BusinessAccount";
            } else if (entityType === "Account") {
              dbEntityType = "Account";
            } else if (entityType === "BarPage") {
              dbEntityType = "BarPage";
            }
            
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityType", sql.NVarChar, dbEntityType)
              .query(`
                SELECT TOP 1 EntityAccountId 
                FROM EntityAccounts 
                WHERE AccountId = @AccountId AND EntityType = @EntityType
              `);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
              console.log('✅ Using EntityAccountId from entityType (first match):', senderEntityAccountId, 'for entityType:', entityType);
            }
          }
          
          if (!senderEntityAccountId) {
            console.warn('⚠️ EntityAccountId not found with provided entityType/entityId, will try other methods');
          }
        } catch (error) {
          console.error('Error finding EntityAccountId from entityType/entityId:', error);
        }
      }
      
      // Priority 2: If frontend provided senderEntityAccountId, validate it belongs to this AccountId
      if (!senderEntityAccountId && requestedSenderEntityAccountId) {
        try {
          const pool = await getPool();
          const validationQuery = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .input("EntityAccountId", sql.UniqueIdentifier, requestedSenderEntityAccountId)
            .query(`
              SELECT EntityAccountId 
              FROM EntityAccounts 
              WHERE AccountId = @AccountId AND EntityAccountId = @EntityAccountId
            `);
          
          if (validationQuery.recordset.length > 0) {
            // Valid: senderEntityAccountId belongs to this AccountId
            senderEntityAccountId = String(requestedSenderEntityAccountId);
            console.log('✅ Using senderEntityAccountId from request (validated):', senderEntityAccountId);
          } else {
            console.warn('⚠️ Requested senderEntityAccountId does not belong to this AccountId, will find from conversation');
          }
        } catch (error) {
          console.error('Error validating senderEntityAccountId from request:', error);
        }
      }
      
      // If not provided or invalid, find from conversation (fallback)
      if (!senderEntityAccountId) {
        try {
          const pool = await getPool();
          const allEntityAccounts = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .query(`
              SELECT EntityAccountId 
              FROM EntityAccounts 
              WHERE AccountId = @AccountId
            `);
          
          const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
          const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
          const participant2 = String(conversation["Người 2"]).toLowerCase().trim();
          
          // Tìm EntityAccountId nào khớp với participant trong conversation
          senderEntityAccountId = allEntityAccountIds.find(eaId => {
            const eaIdNormalized = String(eaId).toLowerCase().trim();
            return eaIdNormalized === participant1 || eaIdNormalized === participant2;
          });
          
          // Nếu không tìm thấy, fallback về Account EntityAccountId
          if (!senderEntityAccountId) {
            senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
            console.log('⚠️ No matching EntityAccountId found in conversation, using Account EntityAccountId:', senderEntityAccountId);
          } else {
            console.log('✅ Found matching EntityAccountId from conversation:', senderEntityAccountId);
          }
        } catch (error) {
          console.error('Error finding EntityAccountId from conversation, using fallback:', error);
          // Fallback về Account EntityAccountId nếu có lỗi
          senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        }
      }
      
      const messageId = new mongoose.Types.ObjectId().toString();
      const message = {
        "Nội Dung Tin Nhắn": content,
        "Gửi Lúc": new Date(),
        "Người Gửi": senderEntityAccountId, // Lưu EntityAccountId
        "Loại": messageType
      };
      
      conversation["Cuộc Trò Chuyện"].set(messageId, message);
      await conversation.save();

      // Xác định receiverId (đã là EntityAccountId trong conversation)
      let receiverId = null;
      if (String(conversation["Người 1"]) === String(senderEntityAccountId)) {
        receiverId = conversation["Người 2"];
      } else {
        receiverId = conversation["Người 1"];
      }
      
      console.log('📤 Message sent - Sender:', senderEntityAccountId, '| Receiver:', receiverId);

      // Gửi realtime qua socket.io (giống Messenger: emit đến conversation room)
      try {
        const io = getIO();
        const receiverIdStr = String(receiverId);
        const conversationRoom = `conversation:${conversationId}`;
        
        const messagePayload = {
          conversationId,
          messageId,
          ...message
        };
        
        // Emit đến conversation room (cả sender và receiver đều nhận nếu đang mở conversation)
        io.to(conversationRoom).emit('new_message', messagePayload);
        
        // Cũng emit đến receiver room để notify khi không mở conversation
        io.to(receiverIdStr).emit('new_message', messagePayload);
        
        console.log('📤 Message emitted to conversation room:', conversationRoom, 'and receiver room:', receiverIdStr);
      } catch (e) {
        console.error('Error emitting socket message:', e);
        // Nếu socket chưa init thì bỏ qua, không crash
      }

      res.status(201).json({ success: true, data: { messageId, content, senderId: senderEntityAccountId, messageType }, message: "Message sent" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Lấy danh sách tin nhắn của 1 cuộc trò chuyện
  async getMessages(req, res) {
    try {
      const { conversationId } = req.params;
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      // Convert AccountId to EntityAccountId (vì conversation lưu EntityAccountId)
      const entityAccountId = await getEntityAccountIdByAccountId(accountId);
      
      console.log('=== GET MESSAGES DEBUG ===');
      console.log('AccountId from JWT:', accountId);
      console.log('EntityAccountId converted:', entityAccountId);
      
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      // Normalize IDs to string and lowercase for comparison
      const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
      const participant2 = String(conversation["Người 2"]).toLowerCase().trim();
      const userEntityId = entityAccountId ? String(entityAccountId).toLowerCase().trim() : null;
      
      console.log('Conversation Participant 1 (raw):', conversation["Người 1"]);
      console.log('Conversation Participant 2 (raw):', conversation["Người 2"]);
      console.log('Conversation Participant 1 (normalized):', participant1);
      console.log('Conversation Participant 2 (normalized):', participant2);
      console.log('User EntityAccountId (normalized):', userEntityId);
      
      // Verify user is participant
      // Conversation có thể lưu EntityAccountId hoặc AccountId (do frontend có thể gửi sai)
      let isParticipant = false;
      const accountIdNormalized = String(accountId).toLowerCase().trim();
      
      // Check 1: So sánh với EntityAccountId
      if (userEntityId) {
        isParticipant = participant1 === userEntityId || participant2 === userEntityId;
        console.log('Check 1 - EntityAccountId match:', isParticipant);
      }
      
      // Check 2: So sánh với AccountId (fallback nếu conversation lưu AccountId)
      if (!isParticipant) {
        isParticipant = participant1 === accountIdNormalized || participant2 === accountIdNormalized;
        console.log('Check 2 - AccountId match:', isParticipant);
      }
      
      // Check 3: Query tất cả EntityAccountId của AccountId để tìm match
      if (!isParticipant && accountId) {
        console.log('Check 3 - Querying all EntityAccountIds for AccountId...');
        try {
          const pool = await getPool();
          const allEntityAccounts = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .query(`
              SELECT EntityAccountId 
              FROM EntityAccounts 
              WHERE AccountId = @AccountId
            `);
          
          const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId).toLowerCase().trim());
          console.log('All EntityAccountIds for AccountId:', allEntityAccountIds);
          
          // Check if any EntityAccountId matches participants
          isParticipant = allEntityAccountIds.some(eaId => 
            participant1 === eaId || participant2 === eaId
          );
          
          if (isParticipant) {
            console.log('✅ Found matching EntityAccountId in all EntityAccounts!');
          }
        } catch (error) {
          console.error('Error querying all EntityAccountIds:', error);
        }
      }
      
      console.log('Is participant:', isParticipant);
      if (!isParticipant) {
        console.error('❌ PARTICIPANT MISMATCH - ACCESS DENIED!');
        console.error('📋 Conversation ID:', conversationId);
        console.error('👤 AccountId from JWT:', accountId);
        console.error('🆔 EntityAccountId converted:', entityAccountId);
        console.error('📝 Conversation Participant 1 (raw):', conversation["Người 1"], '| Type:', typeof conversation["Người 1"]);
        console.error('📝 Conversation Participant 2 (raw):', conversation["Người 2"], '| Type:', typeof conversation["Người 2"]);
        console.error('📝 Conversation Participant 1 (normalized):', participant1);
        console.error('📝 Conversation Participant 2 (normalized):', participant2);
        console.error('👤 User EntityAccountId (normalized):', userEntityId);
        console.error('🔍 Comparison results:');
        console.error('   - participant1 === userEntityId:', participant1 === userEntityId);
        console.error('   - participant2 === userEntityId:', participant2 === userEntityId);
        if (userEntityId) {
          console.error('   - participant1 length:', participant1.length, '| userEntityId length:', userEntityId.length);
          console.error('   - participant2 length:', participant2.length, '| userEntityId length:', userEntityId.length);
          console.error('   - participant1 startsWith userEntityId:', participant1.startsWith(userEntityId));
          console.error('   - participant2 startsWith userEntityId:', participant2.startsWith(userEntityId));
          console.error('   - userEntityId startsWith participant1:', userEntityId.startsWith(participant1));
          console.error('   - userEntityId startsWith participant2:', userEntityId.startsWith(participant2));
        }
        console.error('❌ REASON: User EntityAccountId does not match any participant in conversation');
      }
      console.log('========================');
      
      if (!isParticipant) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied",
          debug: {
            accountId,
            entityAccountId,
            participant1: conversation["Người 1"],
            participant2: conversation["Người 2"],
            userEntityId,
            reason: "User EntityAccountId does not match any participant in conversation"
          }
        });
      }
      // Trả về mảng tin nhắn (convert từ Map sang Array)
      const messages = Array.from(conversation["Cuộc Trò Chuyện"].values());
      res.status(200).json({ success: true, data: messages, message: "Messages retrieved" });
    } catch (error) {
      console.error('Error in getMessages:', error);
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markMessagesRead(req, res) {
    try {
      const { conversationId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId || !conversationId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      // Lấy conversation trước để biết participants
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      // Tìm đúng EntityAccountId từ conversation (hỗ trợ cả Account và role như BarPage/BusinessAccount)
      let entityAccountId = null;
      try {
        const pool = await getPool();
        const allEntityAccounts = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`
            SELECT EntityAccountId 
            FROM EntityAccounts 
            WHERE AccountId = @AccountId
          `);
        
        const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
        const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
        const participant2 = String(conversation["Người 2"]).toLowerCase().trim();
        
        // Tìm EntityAccountId nào khớp với participant trong conversation
        entityAccountId = allEntityAccountIds.find(eaId => {
          const eaIdNormalized = String(eaId).toLowerCase().trim();
          return eaIdNormalized === participant1 || eaIdNormalized === participant2;
        });
        
        // Nếu không tìm thấy, fallback về Account EntityAccountId
        if (!entityAccountId) {
          entityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        }
      } catch (error) {
        console.error('Error finding EntityAccountId from conversation, using fallback:', error);
        // Fallback về Account EntityAccountId nếu có lỗi
        entityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
      }
      
      let updated = false;
      conversation["Cuộc Trò Chuyện"].forEach((msg, key) => {
        // So sánh với EntityAccountId (vì msg["Người Gửi"] là EntityAccountId)
        if (String(msg["Người Gửi"]) !== String(entityAccountId) && !msg["Đã Đọc"]) {
          msg["Đã Đọc"] = true;
          conversation["Cuộc Trò Chuyện"].set(key, msg);
          updated = true;
        }
      });
      if (updated) await conversation.save();
      res.status(200).json({ success: true, message: "Messages marked as read" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
  }
}

module.exports = new MessageController();
