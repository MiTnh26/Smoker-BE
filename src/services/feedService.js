const postService = require("./postService");
const livestreamRepository = require("../repositories/livestreamRepository");
const { getPool, sql } = require("../db/sqlserver");

class FeedService {

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
   * Lấy feed tổng hợp bao gồm posts và livestreams.
   * @param {{ currentUser: object, limit: number, cursor?: string }}
   * @returns {Promise<{feed: Array, nextCursor: string | null, hasMore: boolean}>}
   */
  async getFeed({ currentUser, limit = 10, cursor }) {
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
    // Hiện tại chỉ trả về dữ liệu gốc, có thể mở rộng sau
    return stream;
  }
}

module.exports = new FeedService();

