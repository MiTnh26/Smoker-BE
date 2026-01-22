const { getPool, sql } = require('../db/sqlserver');
const postService = require('./postService');

class SearchService {

  async _searchUsers(pool, query, limit) {
    const request = pool.request();
    request.input('query', sql.NVarChar, `%${query}%`);
    request.input('limit', sql.Int, limit);

    const result = await request.query(`
      SELECT TOP (@limit) *
      FROM (
        -- Tìm kiếm trong Accounts (người dùng thường)
        SELECT 
          EA.EntityAccountId, 
          A.UserName as name, 
          A.Avatar as avatar, 
          'Account' as type
        FROM Accounts A
        JOIN EntityAccounts EA ON A.AccountId = EA.EntityId AND EA.EntityType = 'Account'
        WHERE LOWER(A.UserName) LIKE LOWER(@query)

        UNION ALL

        -- Tìm kiếm trong BusinessAccounts (DJ, Dancer, etc.)
        SELECT 
          EA.EntityAccountId, 
          BA.UserName as name, 
          BA.Avatar as avatar, 
          BA.Role as type
        FROM BussinessAccounts BA
        JOIN EntityAccounts EA ON BA.BussinessAccountId = EA.EntityId AND EA.EntityType = 'BusinessAccount'
        WHERE LOWER(BA.UserName) LIKE LOWER(@query)
      ) AS CombinedUsers;
    `);

  return result.recordset;
}

  async _searchBars(pool, query, limit) {
  const result = await pool.request()
      .input('query', sql.NVarChar, `%${query}%`)
      .input('limit', sql.Int, limit)
    .query(`
        SELECT TOP (@limit) EA.EntityAccountId, BP.BarName as name, BP.Avatar as avatar, 'BarPage' as type
        FROM BarPages BP
        JOIN EntityAccounts EA ON BP.BarPageId = EA.EntityId AND EA.EntityType = 'BarPage'
        WHERE LOWER(BP.BarName) LIKE LOWER(@query)
    `);
  return result.recordset;
}

  async _searchPosts(query, limit) {
    try {
      console.log('[SearchService] _searchPosts - Starting search with query:', query, 'limit:', limit);
      
      // Gọi postService để tìm kiếm posts
    const result = await postService.searchPosts(query, 1, limit);
      
      if (!result.success || !result.data) {
        console.log('[SearchService] _searchPosts - No posts found or error:', result.message);
        return [];
      }
      
      // Đảm bảo trả về array, không phải object
      let postsArray = [];
      if (Array.isArray(result.data)) {
        postsArray = result.data;
      } else if (result.data.posts && Array.isArray(result.data.posts)) {
        postsArray = result.data.posts;
      } else if (typeof result.data === 'object' && !Array.isArray(result.data)) {
        postsArray = Object.values(result.data);
      }
      
      if (postsArray.length === 0) {
        console.log('[SearchService] _searchPosts - No posts in array');
        return [];
      }
      
      console.log('[SearchService] _searchPosts - Found', postsArray.length, 'posts, enriching...');
      
      // Convert Mongoose documents thành plain objects nếu cần
      const postsPlain = postsArray.map(post => {
        if (post && post.toObject) {
          return post.toObject();
        }
        return post;
      });
      
      // Enrich posts với author information (name, avatar, etc.)
      await postService.enrichPostsWithAuthorInfo(postsPlain);
      
      // Enrich comments và replies với author information
      await postService.enrichCommentsWithAuthorInfo(postsPlain);
      
      // Normalize posts: convert comments và replies từ object thành array
      const normalizedPosts = postsPlain.map(post => {
        if (!post || typeof post !== 'object') return post;
        
        const normalized = { ...post };
        
        // Convert comments từ object thành array nếu cần
        if (normalized.comments) {
          if (typeof normalized.comments === 'object' && !Array.isArray(normalized.comments)) {
            normalized.comments = Object.values(normalized.comments);
          }
          
          // Convert replies trong comments thành array nếu cần
          if (Array.isArray(normalized.comments)) {
            normalized.comments = normalized.comments.map(comment => {
              if (!comment || typeof comment !== 'object') return comment;
              
              const normalizedComment = { ...comment };
              
              // Convert replies từ object thành array
              if (normalizedComment.replies) {
                if (typeof normalizedComment.replies === 'object' && !Array.isArray(normalizedComment.replies)) {
                  normalizedComment.replies = Object.values(normalizedComment.replies);
                }
              }
              
              // Convert likes từ object thành array (nếu cần)
              if (normalizedComment.likes && typeof normalizedComment.likes === 'object' && !Array.isArray(normalizedComment.likes)) {
                normalizedComment.likes = Object.keys(normalizedComment.likes);
              }
              
              return normalizedComment;
            });
          }
        }
        
        // Convert likes từ object thành array (nếu cần)
        if (normalized.likes && typeof normalized.likes === 'object' && !Array.isArray(normalized.likes)) {
          normalized.likes = Object.keys(normalized.likes);
        }
        
        return normalized;
      });
      
      console.log('[SearchService] _searchPosts - Returning', normalizedPosts.length, 'normalized posts');
      
      return normalizedPosts;
    } catch (error) {
      console.error('[SearchService] Error in _searchPosts:', error);
      console.error('[SearchService] _searchPosts - Error details:', {
        message: error.message,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Thực hiện tìm kiếm tổng hợp cho Users, Posts, và Bars.
   * @param {string} query - Chuỗi tìm kiếm.
   * @param {number} limit - Giới hạn số lượng kết quả cho mỗi loại.
   * @returns {Promise<object>} - Kết quả tìm kiếm có cấu trúc.
   */
  async searchAll(query, limit = 5) {
    try {
      console.log('[SearchService] searchAll - Starting search with query:', query, 'limit:', limit);
  const pool = await getPool();
      
      const [allUsers, bars, posts] = await Promise.all([
        this._searchUsers(pool, query, limit),
        this._searchBars(pool, query, limit),
        this._searchPosts(query, limit)
  ]);

      console.log('[SearchService] searchAll - Raw results:', {
        allUsersCount: allUsers?.length || 0,
        barsCount: bars?.length || 0,
        postsCount: posts?.length || 0
      });

      // Phân loại người dùng từ kết quả allUsers (case-insensitive)
      const users = allUsers.filter(u => {
        const type = String(u.type || '').toUpperCase();
        return type === 'ACCOUNT';
      });
      const djs = allUsers.filter(u => {
        const type = String(u.type || '').toUpperCase();
        return type === 'DJ';
      });
      const dancers = allUsers.filter(u => {
        const type = String(u.type || '').toUpperCase();
        return type === 'DANCER';
      });

      console.log('[SearchService] searchAll - Filtered results:', {
        usersCount: users.length,
        djsCount: djs.length,
        dancersCount: dancers.length,
        barsCount: bars.length,
        postsCount: posts.length
      });

      return { users, djs, dancers, bars, posts };

    } catch (error) {
      console.error('[SearchService] Error in searchAll:', error);
      console.error('[SearchService] Error details:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Lấy danh sách trending searches (gợi ý tìm kiếm phổ biến)
   * Thuật toán: Kết hợp từ nhiều nguồn:
   * 1. Top trending posts → lấy tên author
   * 2. Popular bars (có nhiều followers)
   * 3. Popular users/DJs/Dancers (có nhiều followers)
   * @param {number} limit - Số lượng kết quả trả về (default: 6)
   * @returns {Promise<Array<string>>} - Danh sách tên trending
   */
  async getTrendingSearches(limit = 6) {
    try {
      const pool = await getPool();
      const trendingSearches = new Map(); // Map để tránh duplicate và tính điểm

      // 1. Lấy top trending posts (top 20 posts có trendingScore cao nhất)
      try {
        const Post = require('../models/postModel');
        const trendingPosts = await Post.find({ status: 'public' })
          .sort({ trendingScore: -1, createdAt: -1 })
          .limit(20)
          .lean()
          .select('entityAccountId authorName authorEntityAccountId');

        // Enrich với author info nếu chưa có
        const postsWithAuthor = trendingPosts.filter(p => p.authorName || p.entityAccountId);
        if (postsWithAuthor.length > 0) {
          const entityIds = postsWithAuthor
            .map(p => p.entityAccountId || p.authorEntityAccountId)
            .filter(Boolean);
          
          if (entityIds.length > 0) {
            // Giới hạn số lượng để tránh query quá dài (tối đa 20 IDs)
            const limitedIds = entityIds.slice(0, 20);
            const request = pool.request();
            
            // Tạo placeholders và bind parameters
            const placeholders = limitedIds.map((_, i) => `@id${i}`).join(',');
            limitedIds.forEach((id, i) => {
              request.input(`id${i}`, sql.UniqueIdentifier, id);
            });

            const authorResult = await request.query(`
              SELECT 
                EA.EntityAccountId,
                CASE 
                  WHEN EA.EntityType = 'Account' THEN A.UserName
                  WHEN EA.EntityType = 'BarPage' THEN BP.BarName
                  WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
                  ELSE NULL
                END AS name
              FROM EntityAccounts EA
              LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
              LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
              LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
              WHERE EA.EntityAccountId IN (${placeholders})
            `);

            authorResult.recordset.forEach(row => {
              const name = row.name;
              if (name && name.trim()) {
                const currentScore = trendingSearches.get(name) || 0;
                trendingSearches.set(name, currentScore + 10); // Trending post = +10 điểm
              }
            });
          }
        }
      } catch (error) {
        console.warn('[SearchService] Error getting trending posts:', error);
      }

      // 2. Lấy popular bars (có nhiều followers) - top 10
      try {
        const popularBarsResult = await pool.request().query(`
          SELECT TOP 10
            BP.BarName as name,
            COUNT(F.FollowerId) as followerCount
          FROM BarPages BP
          LEFT JOIN EntityAccounts EA ON BP.BarPageId = EA.EntityId AND EA.EntityType = 'BarPage'
          LEFT JOIN Follows F ON F.FollowingId = EA.EntityAccountId
          WHERE BP.BarName IS NOT NULL AND BP.BarName != ''
          GROUP BY BP.BarName, EA.EntityAccountId
          HAVING COUNT(F.FollowerId) > 0
          ORDER BY COUNT(F.FollowerId) DESC
        `);

        popularBarsResult.recordset.forEach(row => {
          const name = row.name;
          if (name && name.trim()) {
            const followerCount = row.followerCount || 0;
            const currentScore = trendingSearches.get(name) || 0;
            // Điểm = số followers / 10 (tối đa 5 điểm)
            trendingSearches.set(name, currentScore + Math.min(5, followerCount / 10));
          }
        });
      } catch (error) {
        console.warn('[SearchService] Error getting popular bars:', error);
      }

      // 3. Lấy popular users/DJs/Dancers (có nhiều followers) - top 10
      try {
        // Query riêng cho Accounts
        const popularAccountsResult = await pool.request().query(`
          SELECT TOP 5
            A.UserName as name,
            COUNT(F.FollowerId) as followerCount
          FROM Accounts A
          JOIN EntityAccounts EA ON A.AccountId = EA.EntityId AND EA.EntityType = 'Account'
          LEFT JOIN Follows F ON F.FollowingId = EA.EntityAccountId
          WHERE A.UserName IS NOT NULL AND A.UserName != ''
          GROUP BY A.UserName, EA.EntityAccountId
          HAVING COUNT(F.FollowerId) > 0
          ORDER BY COUNT(F.FollowerId) DESC
        `);

        popularAccountsResult.recordset.forEach(row => {
          const name = row.name;
          if (name && name.trim()) {
            const followerCount = row.followerCount || 0;
            const currentScore = trendingSearches.get(name) || 0;
            trendingSearches.set(name, currentScore + Math.min(5, followerCount / 10));
          }
        });

        // Query riêng cho BusinessAccounts (DJ, Dancer)
        const popularBusinessResult = await pool.request().query(`
          SELECT TOP 5
            BA.UserName as name,
            COUNT(F.FollowerId) as followerCount
          FROM BussinessAccounts BA
          JOIN EntityAccounts EA ON BA.BussinessAccountId = EA.EntityId AND EA.EntityType = 'BusinessAccount'
          LEFT JOIN Follows F ON F.FollowingId = EA.EntityAccountId
          WHERE BA.UserName IS NOT NULL AND BA.UserName != ''
            AND BA.Role IN ('DJ', 'DANCER')
          GROUP BY BA.UserName, EA.EntityAccountId
          HAVING COUNT(F.FollowerId) > 0
          ORDER BY COUNT(F.FollowerId) DESC
        `);

        popularBusinessResult.recordset.forEach(row => {
          const name = row.name;
          if (name && name.trim()) {
            const followerCount = row.followerCount || 0;
            const currentScore = trendingSearches.get(name) || 0;
            trendingSearches.set(name, currentScore + Math.min(5, followerCount / 10));
          }
        });
      } catch (error) {
        console.warn('[SearchService] Error getting popular users:', error);
      }

      // 4. Sort theo điểm và lấy top N
      const sortedSearches = Array.from(trendingSearches.entries())
        .sort((a, b) => b[1] - a[1]) // Sort theo điểm giảm dần
        .slice(0, limit)
        .map(([name]) => name.trim())
        .filter(name => name.length > 0);

      return sortedSearches;
    } catch (error) {
      console.error('[SearchService] Error in getTrendingSearches:', error);
      // Fallback: trả về empty array nếu có lỗi
      return [];
    }
  }
}

module.exports = new SearchService();
