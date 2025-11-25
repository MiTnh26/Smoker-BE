const Message = require("../models/messageDocument");
const mongoose = require("mongoose");
const { getIO } = require('../utils/socket');
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
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
      
      const conversations = await Message.find({
        $or: [
          { "Người 1": { $in: entityAccountIds } },
          { "Người 2": { $in: entityAccountIds } }
        ]
      }).sort({ updatedAt: -1 }).lean();
      
      // Enrich conversations with participant status
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
          const participant1Id = conv["Người 1"];
          const participant2Id = conv["Người 2"];
          
          const [p1Status, p2Status] = await Promise.all([
            getEntityStatus(pool, participant1Id),
            getEntityStatus(pool, participant2Id)
          ]);
          
          // Convert Map to plain object for JSON serialization
          const convObj = {
            ...conv,
            participant1Status: p1Status,
            participant2Status: p2Status
          };
          
          // Ensure "Cuộc Trò Chuyện" is properly serialized
          // MongoDB Map serializes to object with message IDs as keys
          // Convert to array of messages for easier frontend processing
          if (conv["Cuộc Trò Chuyện"]) {
            let messagesArray = [];
            
            if (conv["Cuộc Trò Chuyện"] instanceof Map) {
              // Convert Map to array
              messagesArray = Array.from(conv["Cuộc Trò Chuyện"].values());
            } else if (Array.isArray(conv["Cuộc Trò Chuyện"])) {
              // Already an array
              messagesArray = conv["Cuộc Trò Chuyện"];
            } else if (typeof conv["Cuộc Trò Chuyện"] === 'object') {
              // Object with message IDs as keys - convert to array
              messagesArray = Object.values(conv["Cuộc Trò Chuyện"]);
            }
            
            // Sort by time (newest first) and keep as array
            messagesArray.sort((a, b) => {
              const timeA = a && a["Gửi Lúc"] ? new Date(a["Gửi Lúc"]).getTime() : 0;
              const timeB = b && b["Gửi Lúc"] ? new Date(b["Gửi Lúc"]).getTime() : 0;
              return timeB - timeA;
            });
            
            // Store as array for easier frontend access
            convObj["Cuộc Trò Chuyện"] = messagesArray;
          }
          
          return convObj;
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
      const { conversationId, content, messageType = "text", senderEntityAccountId: requestedSenderEntityAccountId, entityType, entityId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT
      if (!accountId || !conversationId || !content) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      let conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      let senderEntityAccountId = null;
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
            }
          } else if (entityId) {
            const entityAccountQuery = await pool.request()
              .input("AccountId", sql.UniqueIdentifier, accountId)
              .input("EntityId", sql.UniqueIdentifier, entityId)
              .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId AND EntityId = @EntityId`);
            
            if (entityAccountQuery.recordset.length > 0) {
              senderEntityAccountId = String(entityAccountQuery.recordset[0].EntityAccountId);
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
            .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId AND EntityAccountId = @EntityAccountId`);
          
          if (validationQuery.recordset.length > 0) {
            senderEntityAccountId = String(requestedSenderEntityAccountId);
          }
        } catch (error) {
          console.error('Error validating senderEntityAccountId from request:', error);
        }
      }
      
      if (!senderEntityAccountId) {
        try {
          const allEntityAccounts = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
            .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId`);
          
          const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
          const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
          const participant2 = String(conversation["Người 2"]).toLowerCase().trim();
          
          senderEntityAccountId = allEntityAccountIds.find(eaId => {
            const eaIdNormalized = String(eaId).toLowerCase().trim();
            return eaIdNormalized === participant1 || eaIdNormalized === participant2;
          });
          
          if (!senderEntityAccountId) {
            senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
          }
        } catch (error) {
          console.error('Error finding EntityAccountId from conversation, using fallback:', error);
          senderEntityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        }
      }
      
      const messageId = new mongoose.Types.ObjectId().toString();
      const message = {
        "Nội Dung Tin Nhắn": content,
        "Gửi Lúc": new Date(),
        "Người Gửi": senderEntityAccountId,
        "Loại": messageType
      };
      
      // Add metadata if provided (e.g., story reply metadata)
      if (req.body.isStoryReply) {
        message.isStoryReply = true;
        if (req.body.storyId) message.storyId = req.body.storyId;
        if (req.body.storyUrl) message.storyUrl = req.body.storyUrl;
      }
      
      conversation["Cuộc Trò Chuyện"].set(messageId, message);
      await conversation.save();

      let receiverId = (String(conversation["Người 1"]) === String(senderEntityAccountId)) ? conversation["Người 2"] : conversation["Người 1"];
      
      try {
        const io = getIO();
        const receiverIdStr = String(receiverId);
        const conversationRoom = `conversation:${conversationId}`;
        
        const messagePayload = { 
          conversationId, 
          messageId, 
          ...message,
          // Include metadata in socket payload
          isStoryReply: message.isStoryReply || false,
          storyId: message.storyId || null,
          storyUrl: message.storyUrl || null
        };
        
        io.to(conversationRoom).emit('new_message', messagePayload);
        io.to(receiverIdStr).emit('new_message', messagePayload);
      } catch (e) {
        console.error('Error emitting socket message:', e);
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
      const accountId = req.user?.id;
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      let isParticipant = false;
        try {
          const pool = await getPool();
          const allEntityAccounts = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId`);
          
          const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId).toLowerCase().trim());
        const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
        const participant2 = String(conversation["Người 2"]).toLowerCase().trim();

        isParticipant = allEntityAccountIds.some(eaId => participant1 === eaId || participant2 === eaId);
        } catch (error) {
          console.error('Error querying all EntityAccountIds:', error);
        }
      
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

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
      const accountId = req.user?.id;
      if (!accountId || !conversationId) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      
      const conversation = await Message.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ success: false, message: "Conversation not found" });
      }
      
      let entityAccountId = null;
      try {
        const pool = await getPool();
        const allEntityAccounts = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`SELECT EntityAccountId FROM EntityAccounts WHERE AccountId = @AccountId`);
        
        const allEntityAccountIds = allEntityAccounts.recordset.map(r => String(r.EntityAccountId));
        const participant1 = String(conversation["Người 1"]).toLowerCase().trim();
        const participant2 = String(conversation["Người 2"]).toLowerCase().trim();
        
        entityAccountId = allEntityAccountIds.find(eaId => {
          const eaIdNormalized = String(eaId).toLowerCase().trim();
          return eaIdNormalized === participant1 || eaIdNormalized === participant2;
        });
        
        if (!entityAccountId) {
          entityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
        }
      } catch (error) {
        console.error('Error finding EntityAccountId from conversation, using fallback:', error);
        entityAccountId = await getEntityAccountIdByAccountId(accountId) || accountId;
      }
      
      let updated = false;
      conversation["Cuộc Trò Chuyện"].forEach((msg, key) => {
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
