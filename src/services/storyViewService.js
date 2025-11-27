const StoryView = require("../models/storyViewModel");

const normalizeGuid = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

class StoryViewService {
  /**
   * Đánh dấu một story đã được xem bởi user
   * @param {String} storyId - ID của story (MongoDB ObjectId)
   * @param {String} viewerEntityAccountId - EntityAccountId của người xem
   * @returns {Promise<Object>} { success: boolean, message: string }
   */
  async markStoryAsViewed(storyId, viewerEntityAccountId) {
    try {
      if (!storyId || !viewerEntityAccountId) {
        return {
          success: false,
          message: "Story ID and viewer EntityAccountId are required",
        };
      }

      // Sử dụng upsert để tránh duplicate (compound index sẽ đảm bảo unique)
      // Convert viewerEntityAccountId về lowercase để đảm bảo consistency với storyService
      const viewerIdLower = String(viewerEntityAccountId).trim().toLowerCase();
      const storyView = await StoryView.findOneAndUpdate(
        {
          storyId: storyId,
          viewerEntityAccountId: viewerIdLower,
        },
        {
          storyId: storyId,
          viewerEntityAccountId: viewerIdLower,
          viewedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
        }
      );

      return {
        success: true,
        message: "Story marked as viewed",
        data: storyView,
      };
    } catch (error) {
      console.error("[StoryViewService] Error marking story as viewed:", error);
      return {
        success: false,
        message: "Error marking story as viewed",
        error: error.message,
      };
    }
  }

  /**
   * Đánh dấu nhiều stories đã được xem bởi user (batch)
   * @param {Array<String>} storyIds - Mảng các story IDs
   * @param {String} viewerEntityAccountId - EntityAccountId của người xem
   * @returns {Promise<Object>} { success: boolean, message: string, count: number }
   */
  async markStoriesAsViewed(storyIds, viewerEntityAccountId) {
    try {
      if (!Array.isArray(storyIds) || storyIds.length === 0) {
        return {
          success: false,
          message: "Story IDs array is required and must not be empty",
        };
      }

      if (!viewerEntityAccountId) {
        return {
          success: false,
          message: "Viewer EntityAccountId is required",
        };
      }

      // Convert viewerEntityAccountId về lowercase để đảm bảo consistency với storyService
      const viewerId = String(viewerEntityAccountId).trim().toLowerCase();
      const now = new Date();
      let count = 0;

      // Sử dụng bulkWrite để insert/update nhiều records hiệu quả
      const operations = storyIds.map((storyId) => ({
        updateOne: {
          filter: {
            storyId: storyId,
            viewerEntityAccountId: viewerId,
          },
          update: {
            $set: {
              storyId: storyId,
              viewerEntityAccountId: viewerId,
              viewedAt: now,
            },
          },
          upsert: true,
        },
      }));

      const result = await StoryView.bulkWrite(operations);
      count = result.upsertedCount + result.modifiedCount;

      return {
        success: true,
        message: `Marked ${count} stories as viewed`,
        count: count,
      };
    } catch (error) {
      console.error("[StoryViewService] Error marking stories as viewed:", error);
      return {
        success: false,
        message: "Error marking stories as viewed",
        error: error.message,
      };
    }
  }

  /**
   * Lấy danh sách story IDs đã được xem bởi user
   * @param {String} viewerEntityAccountId - EntityAccountId của người xem
   * @returns {Promise<Array<String>>} Mảng các story IDs đã xem
   */
  async getViewedStoryIds(viewerEntityAccountId) {
    try {
      if (!viewerEntityAccountId) {
        return [];
      }

      // Convert viewerEntityAccountId về lowercase để đảm bảo consistency với storyService
      const viewerId = String(viewerEntityAccountId).trim().toLowerCase();
      const views = await StoryView.find({
        viewerEntityAccountId: viewerId,
      })
        .select("storyId")
        .lean();

      // Convert ObjectId to string
      const viewedStoryIds = views.map((view) => String(view.storyId));
      console.log(`[StoryViewService] getViewedStoryIds - viewerId: ${viewerId}, found ${viewedStoryIds.length} viewed stories:`, viewedStoryIds);
      return viewedStoryIds;
    } catch (error) {
      console.error("[StoryViewService] Error getting viewed story IDs:", error);
      return [];
    }
  }

  /**
   * Kiểm tra xem user đã xem story chưa
   * @param {String} storyId - ID của story
   * @param {String} viewerEntityAccountId - EntityAccountId của người xem
   * @returns {Promise<boolean>} true nếu đã xem, false nếu chưa
   */
  async hasViewedStory(storyId, viewerEntityAccountId) {
    try {
      if (!storyId || !viewerEntityAccountId) {
        return false;
      }

      // Convert viewerEntityAccountId về lowercase để đảm bảo consistency với storyService
      const viewerId = String(viewerEntityAccountId).trim().toLowerCase();
      const view = await StoryView.findOne({
        storyId: storyId,
        viewerEntityAccountId: viewerId,
      }).lean();

      return !!view;
    } catch (error) {
      console.error("[StoryViewService] Error checking if story viewed:", error);
      return false;
    }
  }

  /**
   * Lấy danh sách người đã xem story (với thông tin chi tiết)
   * @param {String} storyId - ID của story
   * @returns {Promise<Array>} Mảng các viewer với thông tin đầy đủ
   */
  async getStoryViewers(storyId) {
    try {
      if (!storyId) {
        return [];
      }

      // Lấy danh sách viewers từ StoryView collection
      const views = await StoryView.find({ storyId: storyId })
        .sort({ viewedAt: -1 }) // Sắp xếp theo thời gian xem (mới nhất trước)
        .lean();

      if (views.length === 0) {
        console.log(`[StoryViewService] No viewers found for story ${storyId}`);
        return {
          viewers: [],
          totalLikes: 0,
          totalViews: 0
        };
      }

      // Lấy danh sách unique viewerEntityAccountIds (giữ nguyên case để query EntityAccounts)
      // SQL Server UniqueIdentifier match case-insensitive, nhưng giữ nguyên để đảm bảo
      const viewerEntityAccountIdsRaw = [...new Set(
        views.map(v => String(v.viewerEntityAccountId).trim())
      )];
      
      // Tạo map để convert về lowercase cho lookup (đảm bảo consistency)
      const viewerIdCaseMap = new Map();
      viewerEntityAccountIdsRaw.forEach(id => {
        viewerIdCaseMap.set(id.toLowerCase(), id); // Map lowercase -> original
      });
      const viewerEntityAccountIds = Array.from(viewerIdCaseMap.values()); // Use original for query

      console.log(`[StoryViewService] Found ${views.length} views from ${viewerEntityAccountIds.length} unique viewers for story ${storyId}`, {
        viewerIds: viewerEntityAccountIds.slice(0, 5) // Log first 5 for debugging
      });

      // Lấy thông tin chi tiết của viewers từ EntityAccounts
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      
      const placeholders = viewerEntityAccountIds.map((_, i) => `@EntityAccountId${i}`).join(',');
      const request = pool.request();
      
      viewerEntityAccountIds.forEach((entityAccountId, i) => {
        try {
          request.input(`EntityAccountId${i}`, sql.UniqueIdentifier, entityAccountId);
        } catch (err) {
          console.warn(`[StoryViewService] Invalid EntityAccountId format at index ${i}: ${entityAccountId}`, err.message);
        }
      });

      const entityQuery = await request.query(`
        SELECT 
          EA.EntityAccountId,
          EA.EntityType,
          EA.EntityId,
          EA.AccountId,
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
        WHERE EA.EntityAccountId IN (${placeholders})
      `);

      // Tạo map để lookup nhanh (bao gồm AccountId để check liked)
      const viewerMap = new Map();
      if (entityQuery && entityQuery.recordset) {
        entityQuery.recordset.forEach(row => {
          const entityAccountIdStr = String(row.EntityAccountId).trim().toLowerCase();
          viewerMap.set(entityAccountIdStr, {
            entityAccountId: String(row.EntityAccountId).trim(),
            userName: row.UserName || 'Người dùng',
            avatar: row.Avatar || null,
            entityType: row.EntityType,
            entityId: row.EntityId,
            accountId: String(row.AccountId).trim(), // AccountId để check liked (legacy)
          });
        });
      }

      // Lấy story từ Post collection để kiểm tra likes
      const Post = require("../models/postModel");
      const story = await Post.findById(storyId).lean();
      
      // Kiểm tra liked status cho mỗi viewer (ưu tiên entityAccountId)
      const likedEntityAccountIds = new Set();
      const likedAccountIds = new Set(); // legacy fallback
      if (story && story.likes) {
        if (story.likes instanceof Map) {
          for (const [likeId, like] of story.likes.entries()) {
            if (like.entityAccountId) {
              likedEntityAccountIds.add(normalizeGuid(like.entityAccountId));
            } else if (like.accountId) {
              likedAccountIds.add(normalizeGuid(like.accountId));
            }
          }
        } else if (typeof story.likes === 'object' && story.likes !== null) {
          for (const likeId in story.likes) {
            const like = story.likes[likeId];
            if (like?.entityAccountId) {
              likedEntityAccountIds.add(normalizeGuid(like.entityAccountId));
            } else if (like?.accountId) {
              likedAccountIds.add(normalizeGuid(like.accountId));
            }
          }
        }
      }

      // Lấy entityAccountId của chủ sở hữu story để loại trừ khỏi liked
      const storyOwnerEntityAccountId = story?.entityAccountId ? String(story.entityAccountId).trim().toLowerCase() : null;

      // Kết hợp thông tin từ views và viewerMap, thêm field liked
      const viewers = views.map(view => {
        const viewerIdOriginal = String(view.viewerEntityAccountId).trim();
        const viewerIdLower = viewerIdOriginal.toLowerCase();
        const viewerInfo = viewerMap.get(viewerIdLower);
        
        // Kiểm tra xem viewer có liked story không (ưu tiên entityAccountId)
        // KHÔNG hiển thị lượt tim nếu viewer là chủ sở hữu story
        let isLiked = false;
        const isOwner = storyOwnerEntityAccountId && viewerIdLower === storyOwnerEntityAccountId;
        if (!isOwner) {
          if (likedEntityAccountIds.has(viewerIdLower)) {
            isLiked = true;
          } else if (viewerInfo && viewerInfo.accountId) {
            const accountIdStr = normalizeGuid(viewerInfo.accountId);
            if (accountIdStr && likedAccountIds.has(accountIdStr)) {
              isLiked = true;
            }
          }
        }
        
        return {
          entityAccountId: viewerInfo?.entityAccountId || viewerIdOriginal,
          userName: viewerInfo?.userName || 'Người dùng',
          avatar: viewerInfo?.avatar || null,
          entityType: viewerInfo?.entityType || null,
          entityId: viewerInfo?.entityId || null,
          viewedAt: view.viewedAt,
          liked: isLiked,
        };
      });

      // Tính tổng lượt tim (loại trừ lượt tim của chủ sở hữu)
      let totalLikes = 0;
      if (story && story.likes) {
        if (story.likes instanceof Map) {
          totalLikes = story.likes.size;
        } else if (typeof story.likes === 'object' && story.likes !== null) {
          totalLikes = Object.keys(story.likes).length;
        }
      }

      console.log(`[StoryViewService] Returning ${viewers.length} viewers for story ${storyId}, total likes: ${totalLikes}`);
      return {
        viewers,
        totalLikes,
        totalViews: viewers.length
      };
    } catch (error) {
      console.error("[StoryViewService] Error getting story viewers:", error);
      return {
        viewers: [],
        totalLikes: 0,
        totalViews: 0
      };
    }
  }
}

module.exports = new StoryViewService();

