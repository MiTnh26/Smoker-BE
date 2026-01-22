const postService = require("./postService");
const livestreamRepository = require("../repositories/livestreamRepository");
const { getPool, sql } = require("../db/sqlserver");
const FeedAlgorithm = require("./feedAlgorithm");
const FollowModel = require("../models/followModel");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

class FeedService {

  /**
   * Lấy danh sách mutual follow (bạn bè) - cả 2 đều follow nhau
   * @param {string} viewerAccountId - AccountId của user đang xem
   * @returns {Promise<Array>} Danh sách EntityAccountIds (mutual follow)
   */
  async _getMutualFollowList(viewerAccountId) {
    try {
      // 1. Lấy danh sách mình đang follow (following)
      const followingList = await FeedAlgorithm.getFollowingList(viewerAccountId);
      if (followingList.length === 0) return [];
      
      // 2. Lấy danh sách đang follow mình (followers)
      const viewerEntityAccountId = await getEntityAccountIdByAccountId(viewerAccountId);
      if (!viewerEntityAccountId) return [];
      
      const followersResult = await FollowModel.getFollowers(viewerEntityAccountId);
      if (!followersResult || !Array.isArray(followersResult)) return [];
      
      const followersList = followersResult.map(f => String(f.FollowerId || f.followerId).trim()).filter(Boolean);
      
      // 3. Tìm mutual follow: những người có trong CẢ 2 danh sách
      const followingSet = new Set(followingList.map(id => String(id).trim()));
      const mutualList = followersList.filter(followerId => 
        followingSet.has(String(followerId).trim())
      );
      
      return mutualList;
    } catch (error) {
      console.error('[FeedService] Error getting mutual follow list:', error);
      return [];
    }
  }

  /**
   * Lấy danh sách one-way follow (Follow) - mình follow họ nhưng họ không follow mình
   * @param {string} viewerAccountId - AccountId của user đang xem
   * @returns {Promise<Array>} Danh sách EntityAccountIds (one-way follow)
   */
  async _getOneWayFollowList(viewerAccountId) {
    try {
      // 1. Lấy danh sách mình đang follow (following)
      const followingList = await FeedAlgorithm.getFollowingList(viewerAccountId);
      if (followingList.length === 0) return [];
      
      // 2. Lấy danh sách mutual follow (bạn bè)
      const mutualList = await this._getMutualFollowList(viewerAccountId);
      
      // 3. One-way follow = following - mutual (những người mình follow nhưng họ không follow mình)
      const mutualSet = new Set(mutualList.map(id => String(id).trim()));
      const oneWayList = followingList.filter(followingId => 
        !mutualSet.has(String(followingId).trim())
      );
      
      return oneWayList;
    } catch (error) {
      console.error('[FeedService] Error getting one-way follow list:', error);
      return [];
    }
  }

  async _enrichItemsWithAuthorInfo(items) {
    if (!items || items.length === 0) return;

        const entityAccountIds = new Set();
    items.forEach(item => {
      if (item.entityAccountId) entityAccountIds.add(item.entityAccountId);
      if (item.hostEntityAccountId) entityAccountIds.add(item.hostEntityAccountId); // For livestreams
      // If it's a repost, also get the original post's author
      if (item.originalPost && item.originalPost.entityAccountId) {
        entityAccountIds.add(item.originalPost.entityAccountId);
      }
    });

    const uniqueEntityAccountIds = [...entityAccountIds].filter(Boolean);

        if (uniqueEntityAccountIds.length === 0) return;

    try {
      const pool = await getPool();
            const placeholders = uniqueEntityAccountIds.map((_, i) => `@id${i}`).join(',');
      const request = pool.request();
            uniqueEntityAccountIds.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));

      const result = await request.query(`
        SELECT 
          EA.EntityAccountId,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.UserName
            WHEN EA.EntityType = 'BarPage' THEN BP.BarName
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
            ELSE NULL
          END AS authorName,
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS authorAvatar
        FROM EntityAccounts EA
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId IN (${placeholders})
      `);

      const authorMap = new Map();
      result.recordset.forEach(row => {
        authorMap.set(String(row.EntityAccountId).trim(), {
          authorName: row.authorName || 'Người dùng',
          authorAvatar: row.authorAvatar || null,
        });
      });

      for (const item of items) {
        // Enrich the main item (post or livestream)
        const entityId = item.entityAccountId || item.hostEntityAccountId;
        if (entityId) {
          const authorInfo = authorMap.get(String(entityId).trim());
          if (authorInfo) {
            item.authorName = authorInfo.authorName;
            item.authorAvatar = authorInfo.authorAvatar;
          }
        }

        // If it's a repost, enrich the original post as well
        if (item.originalPost && item.originalPost.entityAccountId) {
          const originalAuthorInfo = authorMap.get(String(item.originalPost.entityAccountId).trim());
          if (originalAuthorInfo) {
            item.originalPost.authorName = originalAuthorInfo.authorName;
            item.originalPost.authorAvatar = originalAuthorInfo.authorAvatar;
          }
        }
      }
    } catch (error) {
      console.error('[FeedService] Error enriching items with author info:', error);
    }
  }

  /**
   * Lấy feed từ những người mình follow nhưng họ không follow mình lại (one-way follow)
   * @param {{ currentUser: object, limit: number, cursor?: string }}
   * @returns {Promise<{feed: Array, nextCursor: string | null, hasMore: boolean}>}
   */
  async getFollowingFeed({ currentUser, limit = 10, cursor }) {
    const viewerAccountId = currentUser?.id;
    if (!viewerAccountId) {
      throw new Error("User must be authenticated to view following feed");
    }
    
    // Lấy danh sách one-way follow
    const followingList = await this._getOneWayFollowList(viewerAccountId);
    
    if (followingList.length === 0) {
      return { feed: [], nextCursor: null, hasMore: false };
    }
    
    // Gọi postService với filter theo followingList
    // Sort theo createdAt DESC (mới nhất lên trước) - không dùng thuật toán ranking
    const viewerEntityAccountId = currentUser?.entityAccountId || null;
    const postResult = await postService.getAllPosts(null, limit, true, true, cursor, true, {
      viewerAccountId,
      viewerEntityAccountId,
      followingList,  // ← One-way follow list
      sortBy: 'createdAt'  // ← Sort theo thời gian mới nhất, không dùng trendingScore
    });
    
    if (!postResult.success) {
      throw new Error(postResult.message || "Failed to fetch posts");
    }
    
    // Enrich và transform như getFeed() hiện tại
    await this._enrichItemsWithAuthorInfo(postResult.data);
    
    const postItems = postResult.data.map(post => ({
      type: 'post',
      timestamp: post.createdAt ? new Date(post.createdAt) : null,
      data: this.transformPost(post, currentUser),
    }));
    
    // Livestreams (optional - có thể bỏ qua cho following feed)
    const livestreams = await livestreamRepository.findActive(5);
    await this._enrichItemsWithAuthorInfo(livestreams);
    const livestreamItems = livestreams.map(stream => ({
      type: 'livestream',
      timestamp: new Date(stream.startTime),
      data: this.transformLivestream(stream, currentUser),
    }));
    
    // Merge posts và livestreams
    const feedItems = [...postItems, ...livestreamItems];
    
    return {
      feed: feedItems,
      nextCursor: postResult.nextCursor,
      hasMore: postResult.hasMore,
    };
  }

  /**
   * Lấy feed từ những người cả 2 đều follow nhau (mutual follow - bạn bè)
   * @param {{ currentUser: object, limit: number, cursor?: string }}
   * @returns {Promise<{feed: Array, nextCursor: string | null, hasMore: boolean}>}
   */
  async getFriendsFeed({ currentUser, limit = 10, cursor }) {
    const viewerAccountId = currentUser?.id;
    if (!viewerAccountId) {
      throw new Error("User must be authenticated to view friends feed");
    }
    
    // Lấy danh sách mutual follow (bạn bè)
    const friendsList = await this._getMutualFollowList(viewerAccountId);
    
    if (friendsList.length === 0) {
      return { feed: [], nextCursor: null, hasMore: false };
    }
    
    // Gọi postService với filter theo friendsList
    // Sort theo createdAt DESC (mới nhất lên trước) - không dùng thuật toán ranking
    const viewerEntityAccountId = currentUser?.entityAccountId || null;
    const postResult = await postService.getAllPosts(null, limit, true, true, cursor, true, {
      viewerAccountId,
      viewerEntityAccountId,
      followingList: friendsList,  // ← Mutual follow list
      sortBy: 'createdAt'  // ← Sort theo thời gian mới nhất, không dùng trendingScore
    });
    
    if (!postResult.success) {
      throw new Error(postResult.message || "Failed to fetch posts");
    }
    
    // Enrich và transform như getFeed() hiện tại
    await this._enrichItemsWithAuthorInfo(postResult.data);
    
    const postItems = postResult.data.map(post => ({
      type: 'post',
      timestamp: post.createdAt ? new Date(post.createdAt) : null,
      data: this.transformPost(post, currentUser),
    }));
    
    // Livestreams
    const livestreams = await livestreamRepository.findActive(5);
    await this._enrichItemsWithAuthorInfo(livestreams);
    const livestreamItems = livestreams.map(stream => ({
      type: 'livestream',
      timestamp: new Date(stream.startTime),
      data: this.transformLivestream(stream, currentUser),
    }));
    
    // Merge posts và livestreams
    const feedItems = [...postItems, ...livestreamItems];
    
    return {
      feed: feedItems,
      nextCursor: postResult.nextCursor,
      hasMore: postResult.hasMore,
    };
  }

  /**
   * Lấy feed tổng hợp bao gồm posts và livestreams.
   * @param {{ currentUser: object, limit: number, cursor?: string, feedType?: string }}
   * @returns {Promise<{feed: Array, nextCursor: string | null, hasMore: boolean}>}
   */
  async getFeed({ currentUser, limit = 10, cursor, feedType = 'trending' }) {
    // Xử lý theo feedType
    if (feedType === 'following') {
      return await this.getFollowingFeed({ currentUser, limit, cursor });
    }
    
    if (feedType === 'friends') {
      return await this.getFriendsFeed({ currentUser, limit, cursor });
    }
    
    // Feed hiện tại (trending) - tất cả posts
    // 1. Lấy dữ liệu từ hai nguồn khác nhau
    const viewerAccountId = currentUser?.id || null;
    const viewerEntityAccountId = currentUser?.entityAccountId || null;
    
    const [postResult, livestreams] = await Promise.all([
      postService.getAllPosts(null, limit, true, true, cursor, true, {
        viewerAccountId,
        viewerEntityAccountId
      }), // populateReposts = true
      livestreamRepository.findActive(5) // Lấy 5 livestreams mới nhất
    ]);

    if (!postResult.success) {
      throw new Error(postResult.message || "Failed to fetch posts");
    }

    // 2. Làm giàu dữ liệu với thông tin tác giả
    await this._enrichItemsWithAuthorInfo(postResult.data);
    await this._enrichItemsWithAuthorInfo(livestreams);

    // 3. Chuyển đổi posts thành feed items.
    // LƯU Ý: postResult.data đã được sort theo trendingScore DESC, createdAt DESC
    // ở tầng PostService, nên ở đây KHÔNG sort lại theo createdAt nữa
    // để giữ nguyên thứ tự theo trending score.
    const postItems = postResult.data.map(post => ({
      type: 'post',
      // Giữ timestamp để FE dùng nếu cần hiển thị, nhưng không dùng để re-sort
      timestamp: post.createdAt ? new Date(post.createdAt) : null,
      data: this.transformPost(post, currentUser),
    }));

    // 4. Shuffle livestreams và chuyển đổi thành feed items
    const shuffledLivestreams = [...livestreams].sort(() => Math.random() - 0.5);
    const livestreamItems = shuffledLivestreams.map(stream => ({
      type: 'livestream',
      timestamp: new Date(stream.startTime),
      data: this.transformLivestream(stream, currentUser),
    }));

    // 5. Insert livestreams vào các vị trí ngẫu nhiên trong posts
    const feedItems = [...postItems];
    livestreamItems.forEach(livestreamItem => {
      const random = Math.random();
      let insertIndex;
      
      if (random < 0.3) {
        // 30% đầu feed (0 đến 30% của length)
        insertIndex = Math.floor(Math.random() * Math.max(1, Math.floor(feedItems.length * 0.3)));
      } else if (random < 0.7) {
        // 40% giữa feed (30% đến 70% của length)
        const start = Math.floor(feedItems.length * 0.3);
        const end = Math.floor(feedItems.length * 0.7);
        insertIndex = start + Math.floor(Math.random() * Math.max(1, end - start));
      } else {
        // 30% cuối feed (70% đến 100% của length)
        const start = Math.floor(feedItems.length * 0.7);
        insertIndex = start + Math.floor(Math.random() * Math.max(1, feedItems.length - start));
      }
      
      // Đảm bảo insertIndex không vượt quá length
      insertIndex = Math.min(insertIndex, feedItems.length);
      
      feedItems.splice(insertIndex, 0, livestreamItem);
    });

    return {
      feed: feedItems,
      nextCursor: postResult.nextCursor,
      hasMore: postResult.hasMore,
    };
  }

  /**
   * Chuyển đổi dữ liệu Post thô sang định dạng cho client.
   * Updated to work with new DTO schema (author, stats, originalPost)
   * @param {object} post - Dữ liệu post từ service (DTO format)
   * @param {object} currentUser - Thông tin user đang đăng nhập
   * @returns {object} - Dữ liệu post đã được xử lý
   */
  transformPost(post, currentUser) {
    const viewer = currentUser?.entityAccountId;
    const postOwner = post.author?.entityAccountId || post.entityAccountId;
    
    const canManage = postOwner && viewer && 
      String(postOwner).trim() === String(viewer).trim();
    
    // stats.isLikedByMe đã được tính đúng trong buildPostDTO
    const isLiked = post.stats?.isLikedByMe || false;

    if (post.originalPost) {
      const originalOwner = post.originalPost.author?.entityAccountId || post.originalPost.entityAccountId;
      post.originalPost.canManage = originalOwner && viewer && 
        String(originalOwner).trim() === String(viewer).trim();
      post.originalPost.isLikedByCurrentUser = post.originalPost.stats?.isLikedByMe || false;
    }

    return { ...post, canManage, isLikedByCurrentUser: isLiked };
  }

  /**
   * Chuyển đổi dữ liệu Livestream thô sang định dạng cho client.
   * @param {object} stream - Dữ liệu livestream từ repository
   * @param {object} currentUser - Thông tin user đang đăng nhập
   * @returns {object} - Dữ liệu livestream đã được xử lý
   */
  transformLivestream(stream, currentUser) {
    // Map authorName/authorAvatar to broadcasterName/broadcasterAvatar for frontend
    const transformed = {
      ...stream,
      broadcasterName: stream.authorName || stream.broadcasterName || null,
      broadcasterAvatar: stream.authorAvatar || stream.broadcasterAvatar || null,
    };
    return transformed;
  }
}

module.exports = new FeedService();

