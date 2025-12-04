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

    // 3. Chuyển đổi posts thành feed items và sort theo timestamp (newest first)
    const postItems = postResult.data.map(post => ({
      type: 'post',
      timestamp: new Date(post.createdAt),
      data: this.transformPost(post, currentUser),
    })).sort((a, b) => b.timestamp - a.timestamp);

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
    const viewerEntityAccountId = currentUser?.entityAccountId;

    // Read from new DTO schema: author.entityAccountId or legacy format
    const postEntityAccountId = post.author?.entityAccountId || post.entityAccountId;
    
    // Logic kiểm tra quyền quản lý (canManage) cho bài post chính
    // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
    const canManage = postEntityAccountId && viewerEntityAccountId &&
                      String(postEntityAccountId).trim().toLowerCase() === String(viewerEntityAccountId).trim().toLowerCase();

    // Read isLiked from new DTO schema: stats.isLikedByMe (already calculated correctly in buildPostDTO)
    // Only use fallback if stats.isLikedByMe is not available (shouldn't happen with new DTO)
    // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
    const isLiked = post.stats?.isLikedByMe !== undefined ? post.stats.isLikedByMe :
                   (post.likes && viewerEntityAccountId
                     ? Object.values(post.likes).some(like => {
                         const likeEntityId = like?.entityAccountId || like?.EntityAccountId;
                         return likeEntityId && String(likeEntityId).trim().toLowerCase() === String(viewerEntityAccountId).trim().toLowerCase();
                       })
                     : false);

    // Nếu là repost, xử lý thêm cho bài post gốc
    if (post.originalPost) {
      const originalPostEntityAccountId = post.originalPost.author?.entityAccountId || post.originalPost.entityAccountId;
      
      // Read isLiked from new DTO schema for originalPost (already calculated correctly in buildPostDTO)
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      const isOriginalPostLiked = post.originalPost.stats?.isLikedByMe !== undefined ? post.originalPost.stats.isLikedByMe :
                                  (post.originalPost.likes && viewerEntityAccountId
                                    ? Object.values(post.originalPost.likes).some(like => {
                                        const likeEntityId = like?.entityAccountId || like?.EntityAccountId;
                                        return likeEntityId && String(likeEntityId).trim().toLowerCase() === String(viewerEntityAccountId).trim().toLowerCase();
                                      })
                                    : false);
      
      post.originalPost.isLikedByCurrentUser = isOriginalPostLiked;

      // Logic canManage cho bài post gốc
      // Dùng toLowerCase() khi so sánh để đảm bảo match được (case-insensitive)
      const canManageOriginal = originalPostEntityAccountId && viewerEntityAccountId &&
                                String(originalPostEntityAccountId).trim().toLowerCase() === String(viewerEntityAccountId).trim().toLowerCase();
      post.originalPost.canManage = canManageOriginal;
    }

    return {
      ...post,
      canManage,
      isLikedByCurrentUser: isLiked,
    };
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

