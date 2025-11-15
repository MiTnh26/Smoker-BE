const postService = require("../services/postService");
const postController = require("./postController");
const storyService = require("../services/storyService");
const storyViewService = require("../services/storyViewService");
const { getEntityAccountIdByAccountId, verifyEntityAccountId } = require("../models/entityAccountModel");

class StoryController {
  // Lấy danh sách story (type=story, còn hạn) - chỉ của những người đã follow
  async getStories(req, res) {
    try {
      console.log(`[StoryController] getStories called - req.user:`, req.user);
      const { page = 1, limit = 10, entityAccountId: queryEntityAccountId } = req.query;
      const accountId = req.user?.id; // AccountId từ JWT middleware
      
      console.log(`[StoryController] Request received - accountId: ${accountId}, queryEntityAccountId: ${queryEntityAccountId}`);
      
      // CHỈ dùng entityAccountId từ query (từ activeEntity)
      // KHÔNG fallback về accountId vì:
      // - Customer: activeEntity = Account → entityAccountId = Account entityAccountId
      // - Bar: activeEntity = BarPage → entityAccountId = BarPage entityAccountId (KHÁC Account)
      // - DJ/Dancer: activeEntity = BusinessAccount → entityAccountId = BusinessAccount entityAccountId (KHÁC Account)
      // Follow relationships dùng entityAccountId, nên phải dùng đúng entityAccountId của role hiện tại
      let userEntityAccountId = queryEntityAccountId || null;
      
      if (!userEntityAccountId) {
        console.warn(`[StoryController] No entityAccountId in query - returning empty stories`);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        });
      }
      
      // Verify entityAccountId có tồn tại trong bảng EntityAccounts
      // Để đảm bảo biết chính xác user là Account/BusinessAccount/BarPage nào
      const entityInfo = await verifyEntityAccountId(userEntityAccountId);
      if (!entityInfo) {
        console.warn(`[StoryController] Invalid entityAccountId: ${userEntityAccountId} - not found in EntityAccounts table`);
        return res.status(400).json({
          success: false,
          message: "Invalid EntityAccountId - not found in database",
        });
      }
      
      console.log(`[StoryController] Using entityAccountId from query: ${userEntityAccountId}`, {
        EntityType: entityInfo.EntityType,
        EntityId: entityInfo.EntityId,
        AccountId: entityInfo.AccountId
      });
      
      // Check if excludeViewed is requested (default: true - filter viewed stories)
      const excludeViewed = req.query.excludeViewed !== 'false';
      
      const result = await storyService.getStories(parseInt(page), parseInt(limit), userEntityAccountId, excludeViewed);
      console.log(`[StoryController] StoryService result:`, { success: result.success, dataLength: result.data?.length || 0 });
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error(`[StoryController] Error in getStories:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Đánh dấu một story đã được xem
  async markStoryAsViewed(req, res) {
    try {
      const { id: storyId } = req.params;
      const { entityAccountId: queryEntityAccountId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT middleware

      if (!storyId) {
        return res.status(400).json({
          success: false,
          message: "Story ID is required",
        });
      }

      // Lấy entityAccountId từ body hoặc từ query (từ activeEntity)
      let viewerEntityAccountId = queryEntityAccountId || null;

      if (!viewerEntityAccountId) {
        console.warn(`[StoryController] No entityAccountId in request - cannot mark story as viewed`);
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required",
        });
      }

      // Verify entityAccountId có tồn tại trong bảng EntityAccounts
      // Để đảm bảo biết chính xác viewer là Account/BusinessAccount/BarPage nào
      const entityInfo = await verifyEntityAccountId(viewerEntityAccountId);
      if (!entityInfo) {
        console.warn(`[StoryController] Invalid entityAccountId: ${viewerEntityAccountId} - not found in EntityAccounts table`);
        return res.status(400).json({
          success: false,
          message: "Invalid EntityAccountId - not found in database",
        });
      }

      console.log(`[StoryController] Marking story ${storyId} as viewed by ${viewerEntityAccountId}`, {
        EntityType: entityInfo.EntityType,
        EntityId: entityInfo.EntityId,
        AccountId: entityInfo.AccountId
      });

      const result = await storyViewService.markStoryAsViewed(storyId, viewerEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error(`[StoryController] Error in markStoryAsViewed:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Đánh dấu nhiều stories đã được xem (batch)
  async markStoriesAsViewed(req, res) {
    try {
      const { storyIds, entityAccountId: queryEntityAccountId } = req.body;
      const accountId = req.user?.id; // AccountId từ JWT middleware

      if (!Array.isArray(storyIds) || storyIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Story IDs array is required and must not be empty",
        });
      }

      // Lấy entityAccountId từ body hoặc từ query (từ activeEntity)
      let viewerEntityAccountId = queryEntityAccountId || null;

      if (!viewerEntityAccountId) {
        console.warn(`[StoryController] No entityAccountId in request - cannot mark stories as viewed`);
        return res.status(400).json({
          success: false,
          message: "EntityAccountId is required",
        });
      }

      // Verify entityAccountId có tồn tại trong bảng EntityAccounts
      // Để đảm bảo biết chính xác viewer là Account/BusinessAccount/BarPage nào
      const entityInfo = await verifyEntityAccountId(viewerEntityAccountId);
      if (!entityInfo) {
        console.warn(`[StoryController] Invalid entityAccountId: ${viewerEntityAccountId} - not found in EntityAccounts table`);
        return res.status(400).json({
          success: false,
          message: "Invalid EntityAccountId - not found in database",
        });
      }

      console.log(`[StoryController] Marking ${storyIds.length} stories as viewed by ${viewerEntityAccountId}`, {
        EntityType: entityInfo.EntityType,
        EntityId: entityInfo.EntityId,
        AccountId: entityInfo.AccountId
      });

      const result = await storyViewService.markStoriesAsViewed(storyIds, viewerEntityAccountId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error(`[StoryController] Error in markStoriesAsViewed:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Lấy danh sách story IDs đã được xem (optional)
  async getViewedStories(req, res) {
    try {
      const { entityAccountId: queryEntityAccountId } = req.query;
      const accountId = req.user?.id; // AccountId từ JWT middleware

      // Lấy entityAccountId từ query (từ activeEntity)
      let viewerEntityAccountId = queryEntityAccountId || null;

      if (!viewerEntityAccountId) {
        console.warn(`[StoryController] No entityAccountId in query - returning empty viewed stories`);
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      // Verify entityAccountId có tồn tại trong bảng EntityAccounts
      const entityInfo = await verifyEntityAccountId(viewerEntityAccountId);
      if (!entityInfo) {
        console.warn(`[StoryController] Invalid entityAccountId: ${viewerEntityAccountId} - not found in EntityAccounts table`);
        return res.status(400).json({
          success: false,
          message: "Invalid EntityAccountId - not found in database",
        });
      }

      console.log(`[StoryController] Getting viewed story IDs for ${viewerEntityAccountId}`, {
        EntityType: entityInfo.EntityType,
        EntityId: entityInfo.EntityId,
        AccountId: entityInfo.AccountId
      });

      const viewedStoryIds = await storyViewService.getViewedStoryIds(viewerEntityAccountId);

      res.status(200).json({
        success: true,
        data: viewedStoryIds,
      });
    } catch (error) {
      console.error(`[StoryController] Error in getViewedStories:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Lấy danh sách người đã xem story
  async getStoryViewers(req, res) {
    try {
      const { id: storyId } = req.params;
      const accountId = req.user?.id; // AccountId từ JWT middleware

      if (!storyId) {
        return res.status(400).json({
          success: false,
          message: "Story ID is required",
        });
      }

      console.log(`[StoryController] Getting viewers for story ${storyId}`);

      const result = await storyViewService.getStoryViewers(storyId);

      // Nếu result là array (backward compatibility) hoặc object mới
      if (Array.isArray(result)) {
        return res.status(200).json({
          success: true,
          data: result,
          count: result.length,
        });
      }

      // Nếu result là object với viewers, totalLikes, totalViews
      res.status(200).json({
        success: true,
        data: result.viewers || [],
        totalLikes: result.totalLikes || 0,
        totalViews: result.totalViews || (result.viewers?.length || 0),
        count: result.viewers?.length || 0,
      });
    } catch (error) {
      console.error(`[StoryController] Error in getStoryViewers:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Like story (gọi lại postController vì story là Post với type: "story")
  async likeStory(req, res) {
    try {
      // Chuyển req.params.id thành req.params.postId để postController có thể sử dụng
      req.params.postId = req.params.id;
      // Gọi lại postController.likePost
      return await postController.likePost(req, res);
    } catch (error) {
      console.error(`[StoryController] Error in likeStory:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }

  // Unlike story (gọi lại postController vì story là Post với type: "story")
  async unlikeStory(req, res) {
    try {
      // Chuyển req.params.id thành req.params.postId để postController có thể sử dụng
      req.params.postId = req.params.id;
      // Gọi lại postController.unlikePost
      return await postController.unlikePost(req, res);
    } catch (error) {
      console.error(`[StoryController] Error in unlikeStory:`, error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}

module.exports = new StoryController();
