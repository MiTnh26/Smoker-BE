const Post = require("../models/postModel");
const FollowModel = require("../models/followModel");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

/**
 * FeedAlgorithm - Thuật toán tính điểm trending cho posts
 * File riêng để dễ chỉnh sửa điểm số sau này
 */
class FeedAlgorithm {
  // Config điểm số (dễ chỉnh sửa)
  static SCORE_WEIGHTS = {
    like: 1,
    comment: 2,
    reply: 1,
    share: 3,
    view: 0.1,
    followBonus: 5,
    timeUp: {
      '0-1h': 10,
      '1-6h': 5,
      '6-24h': 2,
      '24-72h': 1
    },
    timeDecayHours: 48
  };

  /**
   * Tính điểm Time Up dựa trên thời gian đăng bài
   * @param {number} hoursSinceCreated - Số giờ từ khi post được tạo
   * @returns {number} Điểm Time Up
   */
  static getTimeUpScore(hoursSinceCreated) {
    const { timeUp } = this.SCORE_WEIGHTS;
    
    if (hoursSinceCreated <= 1) {
      return timeUp['0-1h'];
    } else if (hoursSinceCreated <= 6) {
      return timeUp['1-6h'];
    } else if (hoursSinceCreated <= 24) {
      return timeUp['6-24h'];
    } else if (hoursSinceCreated <= 72) {
      return timeUp['24-72h'];
    } else {
      return 0;
    }
  }

  /**
   * Tính Time Decay Factor để giảm điểm theo thời gian
   * @param {number} hoursSinceCreated - Số giờ từ khi post được tạo
   * @returns {number} Decay factor (0-1)
   */
  static getTimeDecayFactor(hoursSinceCreated) {
    const { timeDecayHours } = this.SCORE_WEIGHTS;
    // Công thức: 1 / (1 + hours / decayConstant)
    // Posts mới (< 1h): decay ≈ 1.0
    // Posts cũ (> 7 ngày): decay ≈ 0.1
    return 1 / (1 + hoursSinceCreated / timeDecayHours);
  }

  /**
   * Lấy danh sách following của user (optional)
   * @param {string} userId - AccountId của user
   * @returns {Promise<Array>} Danh sách EntityAccountIds đang follow
   */
  static async getFollowingList(userId) {
    try {
      if (!userId) return [];
      
      // Convert AccountId to EntityAccountId
      const entityAccountId = await getEntityAccountIdByAccountId(userId);
      if (!entityAccountId) return [];
      
      // Lấy danh sách following từ FollowModel
      // FollowModel.getFollowing trả về recordset từ SQL query
      const followingResult = await FollowModel.getFollowing(entityAccountId);
      if (!followingResult || !Array.isArray(followingResult)) return [];
      
      // Extract FollowingId từ kết quả
      return followingResult.map(f => f.FollowingId || f.followingId).filter(Boolean);
    } catch (error) {
      console.error('[FeedAlgorithm] Error getting following list:', error);
      return [];
    }
  }

  /**
   * Tính điểm trending cho một post
   * @param {Object} post - Post object từ MongoDB
   * @param {Array} followingList - Danh sách EntityAccountIds đang follow (optional)
   * @returns {number} Điểm trending
   */
  static calculateTrendingScore(post, followingList = []) {
    if (!post) return 0;

    const weights = this.SCORE_WEIGHTS;
    
    // Đếm số lượng likes
    let likesCount = 0;
    if (post.likes instanceof Map) {
      likesCount = post.likes.size;
    } else if (typeof post.likes === 'object' && post.likes !== null) {
      likesCount = Object.keys(post.likes).length;
    } else if (Array.isArray(post.likes)) {
      likesCount = post.likes.length;
    }

    // Đếm số lượng comments
    let commentsCount = 0;
    if (post.comments instanceof Map) {
      commentsCount = post.comments.size;
    } else if (typeof post.comments === 'object' && post.comments !== null) {
      commentsCount = Object.keys(post.comments).length;
    } else if (Array.isArray(post.comments)) {
      commentsCount = post.comments.length;
    }

    // Đếm số lượng replies (tổng tất cả replies trong tất cả comments)
    let repliesCount = 0;
    if (post.comments instanceof Map) {
      for (const [, comment] of post.comments.entries()) {
        if (comment.replies instanceof Map) {
          repliesCount += comment.replies.size;
        } else if (typeof comment.replies === 'object' && comment.replies !== null) {
          repliesCount += Object.keys(comment.replies).length;
        } else if (Array.isArray(comment.replies)) {
          repliesCount += comment.replies.length;
        }
      }
    } else if (typeof post.comments === 'object' && post.comments !== null) {
      for (const comment of Object.values(post.comments)) {
        if (comment.replies instanceof Map) {
          repliesCount += comment.replies.size;
        } else if (typeof comment.replies === 'object' && comment.replies !== null) {
          repliesCount += Object.keys(comment.replies).length;
        } else if (Array.isArray(comment.replies)) {
          repliesCount += comment.replies.length;
        }
      }
    }

    // Lấy số lượng shares và views
    const sharesCount = post.shares || 0;
    const viewsCount = post.views || 0;

    // Tính Base Score
    const baseScore = 
      (likesCount * weights.like) +
      (commentsCount * weights.comment) +
      (repliesCount * weights.reply) +
      (sharesCount * weights.share) +
      (viewsCount * weights.view);

    // Tính Follow Bonus (nếu author được follow)
    let followBonus = 0;
    if (followingList.length > 0 && post.accountId) {
      // Check if post author is in following list
      // Note: post.accountId is AccountId, need to convert to EntityAccountId for comparison
      // For now, we'll check if accountId matches (simplified)
      // In production, should convert accountId to EntityAccountId for accurate comparison
      const isFollowing = followingList.some(followingId => {
        // Simple check - in production should convert accountId to EntityAccountId
        return String(followingId).toLowerCase() === String(post.accountId).toLowerCase();
      });
      
      if (isFollowing) {
        followBonus = weights.followBonus;
      }
    }

    // Tính thời gian từ khi post được tạo
    const createdAt = post.createdAt || post.updatedAt || new Date();
    const now = new Date();
    const hoursSinceCreated = (now - createdAt) / (1000 * 60 * 60); // Convert ms to hours

    // Tính Time Up Score
    const timeUpScore = this.getTimeUpScore(hoursSinceCreated);

    // Tính Time Decay Factor
    const timeDecayFactor = this.getTimeDecayFactor(hoursSinceCreated);

    // Tính Final Score
    const finalScore = (baseScore + followBonus) * timeDecayFactor + timeUpScore;

    return Math.max(0, finalScore); // Đảm bảo điểm không âm
  }

  /**
   * Tính và cập nhật trending score cho một post
   * @param {string} postId - Post ID
   * @param {string} userId - AccountId của user đang xem (optional, để tính follow bonus)
   * @returns {Promise<number>} Điểm trending đã cập nhật
   */
  static async updatePostTrendingScore(postId, userId = null) {
    try {
      const post = await Post.findById(postId);
      if (!post) {
        console.warn(`[FeedAlgorithm] Post not found: ${postId}`);
        return 0;
      }

      // Lấy danh sách following nếu có userId
      let followingList = [];
      if (userId) {
        followingList = await this.getFollowingList(userId);
      }

      // Tính điểm trending
      const trendingScore = this.calculateTrendingScore(post, followingList);

      // Cập nhật vào database
      await Post.findByIdAndUpdate(postId, { 
        $set: { trendingScore: trendingScore } 
      });
      
      return trendingScore;
    } catch (error) {
      console.error(`[FeedAlgorithm] Error updating trending score for post ${postId}:`, error);
      return 0;
    }
  }

  /**
   * Recalculate trending score cho tất cả posts (background job)
   * @param {Object} options - Options: { limit, skip, userId }
   * @returns {Promise<Object>} Kết quả: { processed, updated, errors }
   */
  static async recalculateAllPosts(options = {}) {
    const { limit = 100, skip = 0, userId = null } = options;
    
    try {
      
      // Lấy danh sách following nếu có userId
      let followingList = [];
      if (userId) {
        followingList = await this.getFollowingList(userId);
      }

      // Lấy posts
      const posts = await Post.find()
        .skip(skip)
        .limit(limit)
        .lean();

      let updated = 0;
      let errors = 0;

      for (const post of posts) {
        try {
          const trendingScore = this.calculateTrendingScore(post, followingList);
          
          await Post.findByIdAndUpdate(post._id, {
            $set: { trendingScore: trendingScore }
          });
          
          updated++;
        } catch (error) {
          console.error(`[FeedAlgorithm] Error recalculating post ${post._id}:`, error);
          errors++;
        }
      }

      const result = {
        processed: posts.length,
        updated,
        errors,
        hasMore: posts.length === limit
      };

      return result;
    } catch (error) {
      console.error('[FeedAlgorithm] Error in recalculateAllPosts:', error);
      throw error;
    }
  }
}

module.exports = FeedAlgorithm;

