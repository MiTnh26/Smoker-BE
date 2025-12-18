const Media = require("../models/mediaModel");
const mongoose = require("mongoose");
const { getPool, sql } = require("../db/sqlserver");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

class MediaDetailService {
  async fetchAuthorInfo(entityAccountId) {
    if (!entityAccountId) return null;
    try {
      const pool = await getPool();
      const request = pool.request();
      request.input("EntityAccountId", sql.UniqueIdentifier, entityAccountId);
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
          END AS UserName,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS Avatar
        FROM EntityAccounts EA
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId = @EntityAccountId
      `);
      const row = result?.recordset?.[0];
      if (!row) return null;
      return {
        authorName: row.UserName || "Người dùng",
        authorAvatar: row.Avatar || null,
        authorEntityAccountId: String(row.EntityAccountId).trim(),
        authorEntityId: row.EntityId ? String(row.EntityId).trim() : null,
        authorEntityType: row.EntityType || null,
      };
    } catch (error) {
      console.warn("[MediaDetailService] Failed to fetch author info:", error.message);
      return null;
    }
  }

  async enrichAuthor(mediaData) {
    if (!mediaData) return;
    let entityAccountId = mediaData.entityAccountId || mediaData.authorEntityAccountId;
    if (!entityAccountId && mediaData.accountId) {
      try {
        entityAccountId = await getEntityAccountIdByAccountId(mediaData.accountId);
      } catch (err) {
        console.warn("[MediaDetailService] Cannot resolve EntityAccountId from accountId:", err.message);
      }
    }
    if (!entityAccountId) return;
    const info = await this.fetchAuthorInfo(entityAccountId);
    if (info) {
      mediaData.authorName = mediaData.authorName || info.authorName;
      mediaData.authorAvatar = mediaData.authorAvatar || info.authorAvatar;
      mediaData.authorEntityAccountId = mediaData.authorEntityAccountId || info.authorEntityAccountId;
      mediaData.authorEntityId = mediaData.authorEntityId || info.authorEntityId;
      mediaData.authorEntityType = mediaData.authorEntityType || info.authorEntityType;
    }
  }

  /**
   * Lấy chi tiết media với đầy đủ thông tin (comments với author info)
   * Khác với mediaController.getMediaById - enrich comments với author info
   */
  async getMediaDetail(mediaId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        return {
          success: false,
          message: "Invalid media ID format"
        };
      }

      const media = await Media.findById(mediaId).lean();

      if (!media) {
        return {
          success: false,
          message: "Media not found"
        };
      }

      // Convert Map to Object for JSON response
      const mediaData = { ...media };
      
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
          if (!comment || typeof comment !== 'object') return;
          
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          } else if (!comment.likes) {
            comment.likes = {};
          }
          
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            // Convert likes in replies too
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (!reply || typeof reply !== 'object') return;
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              } else if (!reply.likes) {
                reply.likes = {};
              }
            });
          } else if (!comment.replies) {
            comment.replies = {};
          }
        });
        
        // Enrich comments with author info from SQL Server
        await this.enrichCommentsWithAuthorInfo(mediaData.comments);
      }

      // Enrich media author info
      await this.enrichAuthor(mediaData);

      return {
        success: true,
        data: mediaData
      };
    } catch (error) {
      console.error('[MediaDetailService] Error getting media detail:', error);
      return {
        success: false,
        message: "Error fetching media detail",
        error: error.message
      };
    }
  }

  /**
   * Lấy media detail theo URL (tương tự getMediaByUrl nhưng enrich comments)
   */
  async getMediaDetailByUrl(postId, url) {
    try {
      if (!url) {
        return {
          success: false,
          message: "url is required"
        };
      }

      let query = { url };
      if (postId && mongoose.Types.ObjectId.isValid(postId)) {
        query.postId = new mongoose.Types.ObjectId(postId);
      }

      const media = await Media.findOne(query).lean();

      if (!media) {
        return {
          success: false,
          message: "Media not found"
        };
      }

      // Convert Map to Object for JSON response
      const mediaData = { ...media };
      
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
          if (!comment || typeof comment !== 'object') return;
          
          if (comment.likes instanceof Map) {
            comment.likes = Object.fromEntries(comment.likes);
          } else if (!comment.likes) {
            comment.likes = {};
          }
          
          if (comment.replies instanceof Map) {
            comment.replies = Object.fromEntries(comment.replies);
            Object.keys(comment.replies).forEach(replyKey => {
              const reply = comment.replies[replyKey];
              if (!reply || typeof reply !== 'object') return;
              if (reply.likes instanceof Map) {
                reply.likes = Object.fromEntries(reply.likes);
              } else if (!reply.likes) {
                reply.likes = {};
              }
            });
          } else if (!comment.replies) {
            comment.replies = {};
          }
        });
        
        // Enrich comments with author info from SQL Server
        await this.enrichCommentsWithAuthorInfo(mediaData.comments);
      }

      // Enrich media author info
      await this.enrichAuthor(mediaData);

      return {
        success: true,
        data: mediaData
      };
    } catch (error) {
      console.error('[MediaDetailService] Error getting media detail by URL:', error);
      return {
        success: false,
        message: "Error fetching media detail",
        error: error.message
      };
    }
  }

  /**
   * Enrich comments with author info from SQL Server (giống mediaController)
   */
  async enrichCommentsWithAuthorInfo(comments) {
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
      console.error("[MediaDetailService] Error enriching comments with author info:", error);
    }
  }
}

module.exports = new MediaDetailService();

