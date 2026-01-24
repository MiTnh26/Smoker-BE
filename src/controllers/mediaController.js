const Media = require("../models/mediaModel");
const mongoose = require("mongoose");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");
const notificationService = require("../services/notificationService");

/**
 * Tính tổng số comments bao gồm cả replies (Flatten Count)
 * Công thức: Total = Σ (1 + comment.replies.length)
 * 
 * @param {Map|Object|Array} comments - Comments có thể là Map, Object hoặc Array
 * @returns {number} Tổng số comments (bao gồm replies)
 */
const countTotalComments = (comments) => {
  if (!comments) return 0;
  
  let total = 0;
  let commentsArray = [];
  
  // Convert comments sang Array để xử lý thống nhất
  if (Array.isArray(comments)) {
    commentsArray = comments;
  } else if (comments instanceof Map) {
    commentsArray = Array.from(comments.values());
  } else if (typeof comments === 'object') {
    commentsArray = Object.values(comments);
  } else {
    return 0;
  }
  
  // Duyệt qua mỗi comment: 1 comment + số replies của nó
  commentsArray.forEach(comment => {
    if (!comment || typeof comment !== 'object') return;
    
    // Đếm comment chính (+1)
    total += 1;
    
    // Đếm replies của comment này
    const replies = comment.replies;
    if (replies) {
      if (Array.isArray(replies)) {
        total += replies.length;
      } else if (replies instanceof Map) {
        total += replies.size;
      } else if (typeof replies === 'object') {
        total += Object.keys(replies).length;
      } else if (typeof replies === 'number') {
        total += replies;
      }
    }
  });
  
  return total;
};

// Helper function to enrich comments with author info from SQL Server
async function enrichCommentsWithAuthorInfo(comments) {
  if (!comments || typeof comments !== 'object') return;
  
  // Collect all unique entityAccountIds from comments and replies
  // Fallback sang entityAccountId nếu authorEntityAccountId không có
  const entityAccountIds = new Set();
  
  Object.keys(comments).forEach(key => {
    const comment = comments[key];
    if (!comment || typeof comment !== 'object') return;
    
    // Fallback: dùng entityAccountId nếu authorEntityAccountId không có
    const commentEntityAccountId = comment.authorEntityAccountId || comment.entityAccountId;
    if (commentEntityAccountId) {
      entityAccountIds.add(String(commentEntityAccountId).trim().toLowerCase());
    }
    
    if (comment.replies && typeof comment.replies === 'object') {
      Object.keys(comment.replies).forEach(replyKey => {
        const reply = comment.replies[replyKey];
        if (!reply || typeof reply !== 'object') return;
        
        // Fallback: dùng entityAccountId nếu authorEntityAccountId không có
        const replyEntityAccountId = reply.authorEntityAccountId || reply.entityAccountId;
        if (replyEntityAccountId) {
          entityAccountIds.add(String(replyEntityAccountId).trim().toLowerCase());
        }
      });
    }
  });
  
  if (entityAccountIds.size === 0) return;
  
  // Query SQL Server for all entity info
  try {
    const pool = await getPool();
    const request = pool.request();
    const entityAccountIdsArray = Array.from(entityAccountIds);
    
    // Build query with placeholders
    const placeholders = entityAccountIdsArray.map((_, i) => `@EntityAccountId${i}`).join(',');
    entityAccountIdsArray.forEach((id, i) => {
      request.input(`EntityAccountId${i}`, sql.UniqueIdentifier, id);
    });
    
    const result = await request.query(`
      SELECT 
        EA.EntityAccountId,
        EA.EntityType,
        EA.EntityId,
        CASE 
          WHEN EA.EntityType = 'Account' THEN A.UserName
          WHEN EA.EntityType = 'BarPage' THEN BP.BarName
          WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
          ELSE NULL
        END AS EntityName,
        CASE 
          WHEN EA.EntityType = 'Account' THEN A.Avatar
          WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
          WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
          ELSE NULL
        END AS EntityAvatar
      FROM EntityAccounts EA
      LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
      LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
      LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
      WHERE EA.EntityAccountId IN (${placeholders})
    `);
    
    // Create a map of entityAccountId -> { name, avatar, entityId, entityType }
    const entityMap = new Map();
    if (result && result.recordset) {
      result.recordset.forEach(row => {
        const entityAccountId = String(row.EntityAccountId).trim().toLowerCase();
        entityMap.set(entityAccountId, {
          name: row.EntityName || 'Người dùng',
          avatar: row.EntityAvatar || null,
          entityId: String(row.EntityId).trim(),
          entityType: row.EntityType,
        });
      });
    }
    
    // Enrich comments
    Object.keys(comments).forEach(key => {
      const comment = comments[key];
      if (!comment || typeof comment !== 'object') return;
      
      // Fallback: dùng entityAccountId nếu authorEntityAccountId không có
      const commentEntityAccountId = comment.authorEntityAccountId || comment.entityAccountId;
      if (commentEntityAccountId) {
        const entityAccountId = String(commentEntityAccountId).trim().toLowerCase();
        const entityInfo = entityMap.get(entityAccountId);
        if (entityInfo) {
          comment.authorName = entityInfo.name;
          comment.authorAvatar = entityInfo.avatar;
          comment.authorEntityId = entityInfo.entityId;
          comment.authorEntityType = entityInfo.entityType;
          // Set authorEntityAccountId nếu chưa có
          if (!comment.authorEntityAccountId) {
            comment.authorEntityAccountId = String(commentEntityAccountId).trim();
          }
        } else if (!comment.authorName) {
          comment.authorName = 'Người dùng';
        }
      } else if (!comment.authorName) {
        comment.authorName = 'Người dùng';
      }
      
      // Enrich replies
      if (comment.replies && typeof comment.replies === 'object') {
        Object.keys(comment.replies).forEach(replyKey => {
          const reply = comment.replies[replyKey];
          if (!reply || typeof reply !== 'object') return;
          
          // Fallback: dùng entityAccountId nếu authorEntityAccountId không có
          const replyEntityAccountId = reply.authorEntityAccountId || reply.entityAccountId;
          if (replyEntityAccountId) {
            const entityAccountId = String(replyEntityAccountId).trim().toLowerCase();
            const entityInfo = entityMap.get(entityAccountId);
            if (entityInfo) {
              reply.authorName = entityInfo.name;
              reply.authorAvatar = entityInfo.avatar;
              reply.authorEntityId = entityInfo.entityId;
              reply.authorEntityType = entityInfo.entityType;
              // Set authorEntityAccountId nếu chưa có
              if (!reply.authorEntityAccountId) {
                reply.authorEntityAccountId = String(replyEntityAccountId).trim();
              }
            } else if (!reply.authorName) {
              reply.authorName = 'Người dùng';
            }
          } else if (!reply.authorName) {
            reply.authorName = 'Người dùng';
          }
        });
      }
    });
  } catch (error) {
    console.error("[MEDIA] Error enriching comments with author info:", error);
    // Don't fail the request, just log the error
  }
}

class MediaController {
  // Lấy chi tiết media theo ID (backward compatibility)
  async getMediaById(req, res) {
    try {
      const { mediaId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);

      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Convert Map to Object for JSON response
      const mediaData = media.toObject();
      
      // Convert comments Map to Object
      if (mediaData.comments instanceof Map) {
        mediaData.comments = Object.fromEntries(mediaData.comments);
      }
      
      // Convert likes Map to Object
      if (mediaData.likes instanceof Map) {
        mediaData.likes = Object.fromEntries(mediaData.likes);
      }

      // Convert nested Maps in comments (likes, replies)
      if (mediaData.comments && typeof mediaData.comments === 'object') {
        Object.keys(mediaData.comments).forEach(key => {
          const comment = mediaData.comments[key];
          if (!comment || typeof comment !== 'object') return; // Skip null/invalid comments
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          } else if (!comment.likes) {
            comment.likes = {}; // Ensure likes exists
          }
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            // Convert likes in replies too
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (!reply || typeof reply !== 'object') return; // Skip null/invalid replies
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              } else if (!reply.likes) {
                reply.likes = {}; // Ensure likes exists
              }
            });
          } else if (!comment.replies) {
            comment.replies = {}; // Ensure replies exists
          }
        });
        
        // Enrich comments with author info from SQL Server
        await enrichCommentsWithAuthorInfo(mediaData.comments);
      }

      // ⚠️ TỐI ƯU: Tính tổng comments bao gồm cả replies (Flatten Count)
      const totalCommentsCount = countTotalComments(mediaData.comments);
      
      // Thêm stats vào response nếu chưa có
      if (!mediaData.stats) {
        mediaData.stats = {};
      }
      mediaData.stats.commentCount = totalCommentsCount;

      return res.json({
        success: true,
        data: mediaData
      });
    } catch (error) {
      console.error("[MEDIA] Error getting media by ID:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media",
        error: error.message
      });
    }
  }

  // Lấy chi tiết media (dùng mediaDetailService - enrich đầy đủ comments với author info)
  async getMediaDetail(req, res) {
    try {
      const { mediaId } = req.params;
      const mediaDetailService = require("../services/mediaDetailService");

      const result = await mediaDetailService.getMediaDetail(mediaId);

      if (result.success) {
        return res.json(result);
      } else {
        return res.status(result.message === "Media not found" ? 404 : 400).json(result);
      }
    } catch (error) {
      console.error("[MEDIA] Error getting media detail:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media detail",
        error: error.message
      });
    }
  }

  // Lấy media theo postId và URL (backward compatibility)
  async getMediaByUrl(req, res) {
    try {
      const { postId, url } = req.query;

      // url là bắt buộc, postId là tuỳ chọn
      if (!url) {
        return res.status(400).json({
          success: false,
          message: "url is required"
        });
      }

      let query = { url };
      // Nếu có postId hợp lệ thì lọc theo postId, nếu không thì tìm theo url duy nhất
      if (postId && mongoose.Types.ObjectId.isValid(postId)) {
        query.postId = new mongoose.Types.ObjectId(postId);
      }

      // Find media by (postId?) and url
      const media = await Media.findOne(query);

      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Convert Map to Object for JSON response
      const mediaData = media.toObject();
      
      // Convert comments Map to Object
      if (mediaData.comments instanceof Map) {
        mediaData.comments = Object.fromEntries(mediaData.comments);
      }
      
      // Convert likes Map to Object
      if (mediaData.likes instanceof Map) {
        mediaData.likes = Object.fromEntries(mediaData.likes);
      }

      // Convert nested Maps in comments (likes, replies)
      if (mediaData.comments && typeof mediaData.comments === 'object') {
        Object.keys(mediaData.comments).forEach(key => {
          const comment = mediaData.comments[key];
          if (!comment || typeof comment !== 'object') return; // Skip null/invalid comments
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          } else if (!comment.likes) {
            comment.likes = {}; // Ensure likes exists
          }
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            // Convert likes in replies too
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (!reply || typeof reply !== 'object') return; // Skip null/invalid replies
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              } else if (!reply.likes) {
                reply.likes = {}; // Ensure likes exists
              }
            });
          } else if (!comment.replies) {
            comment.replies = {}; // Ensure replies exists
          }
        });
        
        // Enrich comments with author info from SQL Server
        await enrichCommentsWithAuthorInfo(mediaData.comments);
      }

      // ⚠️ TỐI ƯU: Tính tổng comments bao gồm cả replies (Flatten Count)
      const totalCommentsCount = countTotalComments(mediaData.comments);
      
      // Thêm stats vào response nếu chưa có
      if (!mediaData.stats) {
        mediaData.stats = {};
      }
      mediaData.stats.commentCount = totalCommentsCount;

      return res.json({
        success: true,
        data: mediaData
      });
    } catch (error) {
      console.error("[MEDIA] Error getting media by URL:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media",
        error: error.message
      });
    }
  }

  // Lấy chi tiết media theo URL (dùng mediaDetailService - enrich đầy đủ comments với author info)
  async getMediaDetailByUrl(req, res) {
    try {
      const { postId, url } = req.query;
      const mediaDetailService = require("../services/mediaDetailService");

      if (!url) {
        return res.status(400).json({
          success: false,
          message: "url is required"
        });
      }

      const result = await mediaDetailService.getMediaDetailByUrl(postId, url);

      if (result.success) {
        return res.json(result);
      } else {
        return res.status(result.message === "Media not found" ? 404 : 400).json(result);
      }
    } catch (error) {
      console.error("[MEDIA] Error getting media detail by URL:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get media detail",
        error: error.message
      });
    }
  }

  // Add Comment to Media
  async addComment(req, res) {
    try {
      const { mediaId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let commentEntityAccountId = entityAccountId;
      let commentEntityId = entityId;
      let commentEntityType = entityType;

      if (!commentEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required for commenting"
        });
      }

      // Normalize entityType nếu chưa có
      if (!commentEntityType && commentEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, commentEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            commentEntityType = result.recordset[0].EntityType;
            if (!commentEntityId) {
              commentEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityType from EntityAccountId:", err);
        }
      }

      // Lấy authorName và authorAvatar từ request body hoặc từ SQL Server
      let authorName = req.body.authorName || req.body.authorEntityName || null;
      let authorAvatar = req.body.authorAvatar || req.body.authorEntityAvatar || null;
      
      // Nếu chưa có, lấy từ SQL Server
      if (!authorName || !authorAvatar) {
        try {
          const pool = await getPool();
          if (commentEntityAccountId) {
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, commentEntityAccountId)
              .query(`SELECT TOP 1 EntityName, EntityAvatar FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            
            if (result.recordset.length > 0) {
              if (!authorName) authorName = result.recordset[0].EntityName;
              if (!authorAvatar) authorAvatar = result.recordset[0].EntityAvatar;
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get author info from SQL Server:", err);
        }
      }

      // Tạo ID mới cho comment
      const commentId = new mongoose.Types.ObjectId();
      const comment = {
        id: commentId,
        accountId: userId, // Backward compatibility
        entityAccountId: commentEntityAccountId,
        entityId: commentEntityId,
        entityType: commentEntityType,
        authorEntityAccountId: commentEntityAccountId,
        authorEntityId: commentEntityId,
        authorEntityType: commentEntityType,
        authorName: authorName || "Người dùng",
        authorAvatar: authorAvatar || null,
        content,
        images: images || "",
        TypeRole: typeRole || commentEntityType || "Account",
        likes: new Map(),
        replies: new Map(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      media.comments.set(commentId.toString(), comment);
      media.markModified('comments');
      await media.save();

      // Tạo notification cho media owner (không gửi nếu comment chính mình)
      try {
        const senderEntityAccountId = commentEntityAccountId;
        const receiverEntityAccountId = media.entityAccountId;
        
        // Chỉ tạo notification nếu sender !== receiver
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim().toLowerCase() !== String(receiverEntityAccountId).trim().toLowerCase()) {
          
          // Lấy sender và receiver accountIds cho backward compatibility
          const senderAccountId = userId;
          const receiverAccountId = media.accountId;
          
          // Lấy entity info
          let senderEntityId = commentEntityId;
          let senderEntityType = commentEntityType;
          let receiverEntityId = media.entityId;
          let receiverEntityType = media.entityType;
          
          // Get sender entity info from SQL Server if not available
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get sender entity info:", err);
            }
          }
          
          // Get receiver entity info from SQL Server if not available
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createCommentNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: media.postId.toString()
          });
        }
      } catch (notifError) {
        // Log error but don't fail the comment operation
        console.error("[MEDIA] Error creating comment notification:", notifError);
      }

      return res.status(200).json({
        success: true,
        data: media,
        message: "Comment added successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error adding comment:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Add Reply to Comment
  async addCommentReply(req, res) {
    try {
      const { mediaId, commentId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID or comment ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let replyEntityAccountId = entityAccountId;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

      if (!replyEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required for replying"
        });
      }

      // Normalize entityType nếu chưa có
      if (!replyEntityType && replyEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            replyEntityType = result.recordset[0].EntityType;
            if (!replyEntityId) {
              replyEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityType from EntityAccountId:", err);
        }
      }

      // Lấy authorName và authorAvatar từ request body hoặc từ SQL Server
      let authorName = req.body.authorName || req.body.authorEntityName || null;
      let authorAvatar = req.body.authorAvatar || req.body.authorEntityAvatar || null;
      
      // Nếu chưa có, lấy từ SQL Server
      if (!authorName || !authorAvatar) {
        try {
          const pool = await getPool();
          if (replyEntityAccountId) {
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
              .query(`SELECT TOP 1 EntityName, EntityAvatar FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            
            if (result.recordset.length > 0) {
              if (!authorName) authorName = result.recordset[0].EntityName;
              if (!authorAvatar) authorAvatar = result.recordset[0].EntityAvatar;
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get author info from SQL Server:", err);
        }
      }

      // Tạo ID mới cho reply
      const replyId = new mongoose.Types.ObjectId();
      const reply = {
        id: replyId,
        accountId: userId,
        entityAccountId: replyEntityAccountId,
        entityId: replyEntityId,
        entityType: replyEntityType,
        authorEntityAccountId: replyEntityAccountId,
        authorEntityId: replyEntityId,
        authorEntityType: replyEntityType,
        authorName: authorName || "Người dùng",
        authorAvatar: authorAvatar || null,
        content,
        images: images || "",
        TypeRole: typeRole || replyEntityType || "Account",
        replyToId: commentId, // Reply vào comment
        likes: new Map(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      comment.replies.set(replyId.toString(), reply);
      media.markModified('comments');
      await media.save();

      // Tạo notification cho comment owner
      try {
        const senderEntityAccountId = replyEntityAccountId;
        const receiverEntityAccountId = comment.entityAccountId;
        
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim().toLowerCase() !== String(receiverEntityAccountId).trim().toLowerCase()) {
          
          const senderAccountId = userId;
          const receiverAccountId = comment.accountId;
          
          let senderEntityId = replyEntityId;
          let senderEntityType = replyEntityType;
          let receiverEntityId = comment.entityId;
          let receiverEntityType = comment.entityType;
          
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get sender entity info:", err);
            }
          }
          
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createReplyNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: media.postId.toString(),
            commentId: commentId.toString()
          });
        }
      } catch (notifError) {
        console.error("[MEDIA] Error creating reply notification:", notifError);
      }

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply added successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error adding reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Add Reply to Reply (nested)
  async addReplyToReply(req, res) {
    try {
      const { mediaId, commentId, replyId } = req.params;
      const { content, images, typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(replyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID, comment ID or reply ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      const targetReply = comment.replies.get(replyId);
      if (!targetReply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found"
        });
      }

      // Lấy entityAccountId, entityId, entityType từ request body hoặc từ accountId
      let replyEntityAccountId = entityAccountId;
      let replyEntityId = entityId;
      let replyEntityType = entityType;

      if (!replyEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "entityAccountId is required for replying"
        });
      }

      // Normalize entityType nếu chưa có
      if (!replyEntityType && replyEntityAccountId) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          
          if (result.recordset.length > 0) {
            replyEntityType = result.recordset[0].EntityType;
            if (!replyEntityId) {
              replyEntityId = String(result.recordset[0].EntityId);
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityType from EntityAccountId:", err);
        }
      }

      // Lấy authorName và authorAvatar từ request body hoặc từ SQL Server
      let authorName = req.body.authorName || req.body.authorEntityName || null;
      let authorAvatar = req.body.authorAvatar || req.body.authorEntityAvatar || null;
      
      // Nếu chưa có, lấy từ SQL Server
      if (!authorName || !authorAvatar) {
        try {
          const pool = await getPool();
          if (replyEntityAccountId) {
            const result = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, replyEntityAccountId)
              .query(`SELECT TOP 1 EntityName, EntityAvatar FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
            
            if (result.recordset.length > 0) {
              if (!authorName) authorName = result.recordset[0].EntityName;
              if (!authorAvatar) authorAvatar = result.recordset[0].EntityAvatar;
            }
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get author info from SQL Server:", err);
        }
      }

      // Tạo ID mới cho reply
      const newReplyId = new mongoose.Types.ObjectId();
      const newReply = {
        id: newReplyId,
        accountId: userId,
        entityAccountId: replyEntityAccountId,
        entityId: replyEntityId,
        entityType: replyEntityType,
        authorEntityAccountId: replyEntityAccountId,
        authorEntityId: replyEntityId,
        authorEntityType: replyEntityType,
        authorName: authorName || "Người dùng",
        authorAvatar: authorAvatar || null,
        content,
        images: images || "",
        TypeRole: typeRole || replyEntityType || "Account",
        replyToId: replyId, // Reply vào reply
        likes: new Map(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      comment.replies.set(newReplyId.toString(), newReply);
      media.markModified('comments');
      await media.save();

      // Tạo notification cho reply owner
      try {
        const senderEntityAccountId = replyEntityAccountId;
        const receiverEntityAccountId = targetReply.entityAccountId;
        
        if (senderEntityAccountId && receiverEntityAccountId && 
            String(senderEntityAccountId).trim().toLowerCase() !== String(receiverEntityAccountId).trim().toLowerCase()) {
          
          const senderAccountId = userId;
          const receiverAccountId = targetReply.accountId;
          
          let senderEntityId = replyEntityId;
          let senderEntityType = replyEntityType;
          let receiverEntityId = targetReply.entityId;
          let receiverEntityType = targetReply.entityType;
          
          if (senderEntityAccountId && (!senderEntityId || !senderEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, senderEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                senderEntityType = result.recordset[0].EntityType;
                senderEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get sender entity info:", err);
            }
          }
          
          if (receiverEntityAccountId && (!receiverEntityId || !receiverEntityType)) {
            try {
              const pool = await getPool();
              const result = await pool.request()
                .input("EntityAccountId", sql.UniqueIdentifier, receiverEntityAccountId)
                .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
              if (result.recordset.length > 0) {
                receiverEntityType = result.recordset[0].EntityType;
                receiverEntityId = String(result.recordset[0].EntityId);
              }
            } catch (err) {
              console.warn("[MEDIA] Could not get receiver entity info:", err);
            }
          }
          
          await notificationService.createReplyNotification({
            sender: senderAccountId,
            senderEntityAccountId: String(senderEntityAccountId),
            senderEntityId: senderEntityId,
            senderEntityType: senderEntityType,
            receiver: receiverAccountId,
            receiverEntityAccountId: String(receiverEntityAccountId),
            receiverEntityId: receiverEntityId,
            receiverEntityType: receiverEntityType,
            postId: media.postId.toString(),
            commentId: commentId.toString()
          });
        }
      } catch (notifError) {
        console.error("[MEDIA] Error creating reply notification:", notifError);
      }

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply to reply added successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error adding reply to reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Like Comment
  async likeComment(req, res) {
    try {
      const { mediaId, commentId } = req.params;
      const { typeRole = "Account", entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID or comment ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      let userEntityId = req.body.entityId || null;
      let userEntityType = req.body.entityType || null;
      
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for like comment:", err);
        }
      }

      if (!userEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required"
        });
      }

      // Lấy entityId và entityType từ SQL Server nếu chưa có
      if (userEntityAccountId && (!userEntityId || !userEntityType)) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          if (result.recordset.length > 0) {
            userEntityType = result.recordset[0].EntityType;
            userEntityId = String(result.recordset[0].EntityId);
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get entity info for like comment:", err);
        }
      }

      // Kiểm tra xem đã like chưa
      const likeKey = userEntityAccountId.toString();
      if (comment.likes.has(likeKey)) {
        return res.status(400).json({
          success: false,
          message: "Already liked"
        });
      }

      // Thêm like với đầy đủ thông tin entity
      comment.likes.set(likeKey, {
        accountId: userId,
        entityAccountId: userEntityAccountId,
        entityId: userEntityId,
        entityType: userEntityType,
        TypeRole: typeRole || userEntityType || "Account"
      });

      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Comment liked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error liking comment:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Unlike Comment
  async unlikeComment(req, res) {
    try {
      const { mediaId, commentId } = req.params;
      const { entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID or comment ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for unlike comment:", err);
        }
      }

      if (!userEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required"
        });
      }

      // Xóa like
      const likeKey = userEntityAccountId.toString();
      if (!comment.likes.has(likeKey)) {
        return res.status(400).json({
          success: false,
          message: "Not liked yet"
        });
      }

      comment.likes.delete(likeKey);
      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Comment unliked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error unliking comment:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Like Reply
  async likeReply(req, res) {
    try {
      const { mediaId, commentId, replyId } = req.params;
      const { typeRole = "Account", entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(replyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID, comment ID or reply ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      let userEntityId = req.body.entityId || null;
      let userEntityType = req.body.entityType || null;
      
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for like reply:", err);
        }
      }

      if (!userEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required"
        });
      }

      // Lấy entityId và entityType từ SQL Server nếu chưa có
      if (userEntityAccountId && (!userEntityId || !userEntityType)) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          if (result.recordset.length > 0) {
            userEntityType = result.recordset[0].EntityType;
            userEntityId = String(result.recordset[0].EntityId);
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get entity info for like reply:", err);
        }
      }

      // Kiểm tra xem đã like chưa
      const likeKey = userEntityAccountId.toString();
      if (reply.likes.has(likeKey)) {
        return res.status(400).json({
          success: false,
          message: "Already liked"
        });
      }

      // Thêm like với đầy đủ thông tin entity
      reply.likes.set(likeKey, {
        accountId: userId,
        entityAccountId: userEntityAccountId,
        entityId: userEntityId,
        entityType: userEntityType,
        TypeRole: typeRole || userEntityType || "Account"
      });

      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply liked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error liking reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Unlike Reply
  async unlikeReply(req, res) {
    try {
      const { mediaId, commentId, replyId } = req.params;
      const { entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(replyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID, comment ID or reply ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for unlike reply:", err);
        }
      }

      if (!userEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required"
        });
      }

      // Xóa like
      const likeKey = userEntityAccountId.toString();
      if (!reply.likes.has(likeKey)) {
        return res.status(400).json({
          success: false,
          message: "Not liked yet"
        });
      }

      reply.likes.delete(likeKey);
      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply unliked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error unliking reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Update Comment
  async updateComment(req, res) {
    try {
      const { mediaId, commentId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID or comment ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Kiểm tra ownership
      if (String(comment.accountId) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this comment"
        });
      }

      // Cập nhật content
      comment.content = content;
      comment.updatedAt = new Date();

      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Comment updated successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error updating comment:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Delete Comment
  async deleteComment(req, res) {
    try {
      const { mediaId, commentId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID or comment ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      // Kiểm tra ownership
      if (String(comment.accountId) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this comment"
        });
      }

      // Xóa comment
      media.comments.delete(commentId);
      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Comment deleted successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error deleting comment:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Update Reply
  async updateReply(req, res) {
    try {
      const { mediaId, commentId, replyId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(replyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID, comment ID or reply ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found"
        });
      }

      // Kiểm tra ownership
      if (String(reply.accountId) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to update this reply"
        });
      }

      // Cập nhật content
      reply.content = content;
      reply.updatedAt = new Date();

      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply updated successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error updating reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Delete Reply
  async deleteReply(req, res) {
    try {
      const { mediaId, commentId, replyId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId) || !mongoose.Types.ObjectId.isValid(commentId) || !mongoose.Types.ObjectId.isValid(replyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID, comment ID or reply ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      const comment = media.comments.get(commentId);
      if (!comment) {
        return res.status(404).json({
          success: false,
          message: "Comment not found"
        });
      }

      const reply = comment.replies.get(replyId);
      if (!reply) {
        return res.status(404).json({
          success: false,
          message: "Reply not found"
        });
      }

      // Kiểm tra ownership
      if (String(reply.accountId) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this reply"
        });
      }

      // Xóa reply
      comment.replies.delete(replyId);
      media.markModified('comments');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Reply deleted successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error deleting reply:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Like Media
  async likeMedia(req, res) {
    try {
      const { mediaId } = req.params;
      const { typeRole, entityAccountId, entityId, entityType } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      let userEntityId = entityId || null;
      let userEntityType = entityType || null;
      
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for like media:", err);
        }
      }

      // Lấy entityId và entityType từ SQL Server nếu chưa có
      if (userEntityAccountId && (!userEntityId || !userEntityType)) {
        try {
          const pool = await getPool();
          const result = await pool.request()
            .input("EntityAccountId", sql.UniqueIdentifier, userEntityAccountId)
            .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
          if (result.recordset.length > 0) {
            userEntityType = result.recordset[0].EntityType;
            userEntityId = String(result.recordset[0].EntityId);
          }
        } catch (err) {
          console.warn("[MEDIA] Could not get entity info for like media:", err);
        }
      }

      // Lấy TypeRole từ request body hoặc từ entityType hoặc mặc định là "Account"
      let userTypeRole = typeRole || userEntityType || "Account";
      
      // Nếu chưa có, lấy từ user role
      if (!typeRole && !userEntityType) {
        const userRole = req.user?.role;
        if (userRole) {
          const normalizedRole = String(userRole).toLowerCase();
          if (normalizedRole === "bar") {
            userTypeRole = "BarPage";
          } else if (normalizedRole === "dj" || normalizedRole === "dancer") {
            userTypeRole = "BusinessAccount";
          } else {
            userTypeRole = "Account";
          }
        }
      }

      // Sử dụng entityAccountId làm likeKey nếu có, nếu không thì dùng userId
      const likeKey = userEntityAccountId ? String(userEntityAccountId) : String(userId);
      
      // Kiểm tra xem user đã like chưa
      if (media.likes.has(likeKey)) {
        return res.status(400).json({
          success: false,
          message: "Already liked"
        });
      }

      // Thêm like vào Map với đầy đủ thông tin entity
      media.likes.set(likeKey, {
        accountId: userId,
        entityAccountId: userEntityAccountId,
        entityId: userEntityId,
        entityType: userEntityType,
        TypeRole: userTypeRole,
        createdAt: new Date()
      });

      media.markModified('likes');
      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Media liked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error liking media:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Unlike Media
  async unlikeMedia(req, res) {
    try {
      const { mediaId } = req.params;
      const { entityAccountId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Lấy entityAccountId từ request body hoặc từ accountId
      let userEntityAccountId = entityAccountId;
      if (!userEntityAccountId) {
        try {
          userEntityAccountId = await getEntityAccountIdByAccountId(userId);
        } catch (err) {
          console.warn("[MEDIA] Could not get EntityAccountId for unlike media:", err);
        }
      }

      // Sử dụng entityAccountId làm likeKey nếu có, nếu không thì dùng userId
      const likeKey = userEntityAccountId ? String(userEntityAccountId) : String(userId);
      
      // Xóa like khỏi Map
      if (media.likes.has(likeKey)) {
        media.likes.delete(likeKey);
        media.markModified('likes');
        await media.save();
      }

      return res.status(200).json({
        success: true,
        data: media,
        message: "Media unliked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error unliking media:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Track Share
  async trackShare(req, res) {
    try {
      const { mediaId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid media ID format"
        });
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found"
        });
      }

      // Tăng số lượt share (nếu có field shares)
      // Nếu chưa có field shares, có thể bỏ qua hoặc thêm vào schema
      if (media.shares !== undefined) {
        media.shares = (media.shares || 0) + 1;
      } else {
        // Nếu chưa có field shares, set mặc định là 1
        media.shares = 1;
      }

      await media.save();

      return res.status(200).json({
        success: true,
        data: media,
        message: "Share tracked successfully"
      });
    } catch (error) {
      console.error("[MEDIA] Error tracking share:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }
}

module.exports = new MediaController();

