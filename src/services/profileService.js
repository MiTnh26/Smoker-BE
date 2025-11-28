const { getPool, sql } = require('../db/sqlserver');
const postService = require('./postService');

const getFirstString = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
};

const buildAddressText = (addressObj) => {
  if (!addressObj || typeof addressObj !== 'object') return null;

  const fullAddress = getFirstString(
    addressObj.fullAddress,
    addressObj.FullAddress,
    addressObj.addressText,
    addressObj.AddressText
  );
  if (fullAddress) return fullAddress;

  const detail = getFirstString(
    addressObj.detail,
    addressObj.Detail,
    addressObj.addressDetail,
    addressObj.AddressDetail,
    addressObj.street,
    addressObj.Street
  );
  const ward = getFirstString(
    addressObj.wardName,
    addressObj.WardName,
    addressObj.ward,
    addressObj.Ward
  );
  const district = getFirstString(
    addressObj.districtName,
    addressObj.DistrictName,
    addressObj.district,
    addressObj.District
  );
  const province = getFirstString(
    addressObj.provinceName,
    addressObj.ProvinceName,
    addressObj.province,
    addressObj.Province
  );

  const parts = [detail, ward, district, province].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const normalizeAddressField = (rawAddress) => {
  if (!rawAddress) {
    return { text: null, object: null, raw: null };
  }

  if (typeof rawAddress === 'string') {
    const trimmed = rawAddress.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          text: buildAddressText(parsed) || trimmed,
          object: parsed,
          raw: rawAddress
        };
      } catch (err) {
        console.warn('[ProfileService] Failed to parse address JSON, returning raw string:', err?.message || err);
        return { text: trimmed, object: null, raw: rawAddress };
      }
    }
    return { text: trimmed, object: null, raw: rawAddress };
  }

  if (typeof rawAddress === 'object') {
    return {
      text: buildAddressText(rawAddress),
      object: rawAddress,
      raw: rawAddress
    };
  }

  return { text: String(rawAddress), object: null, raw: rawAddress };
};

class ProfileService {

  /**
   * Lấy thông tin chi tiết của một entity từ SQL Server.
   * Bao gồm tất cả các trường cần thiết cho PublicProfile.
   */
  async _getEntityInfo(pool, entityAccountId) {
    try {
      console.log('[ProfileService] _getEntityInfo - Starting with entityAccountId:', entityAccountId);
      const request = pool.request();
      request.input('EntityAccountId', sql.UniqueIdentifier, entityAccountId);
      console.log('[ProfileService] _getEntityInfo - Executing SQL query...');
      const result = await request.query(`
        SELECT 
          EA.EntityAccountId, EA.EntityType, EA.EntityId,
          -- Name/UserName
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.UserName
            WHEN EA.EntityType = 'BarPage' THEN BP.BarName
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
            ELSE NULL
          END AS name,
          -- Avatar
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS avatar,
          -- Background
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Background
            WHEN EA.EntityType = 'BarPage' THEN BP.Background
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Background
            ELSE NULL
          END AS background,
          -- Bio/Description (BarPages không có Description, dùng NULL)
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Bio
            WHEN EA.EntityType = 'BarPage' THEN NULL
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Bio
            ELSE NULL
          END AS bio,
          -- Role
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Role
            WHEN EA.EntityType = 'BarPage' THEN 'BAR'
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Role
            ELSE NULL
          END AS role,
          -- Address
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Address
            WHEN EA.EntityType = 'BarPage' THEN BP.Address
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Address
            ELSE NULL
          END AS address,
          -- Phone (BarPages dùng PhoneNumber, Accounts và BusinessAccounts dùng Phone)
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Phone
            WHEN EA.EntityType = 'BarPage' THEN BP.PhoneNumber
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Phone
            ELSE NULL
          END AS phone,
          -- Gender (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Gender
            ELSE NULL
          END AS gender,
          -- PricePerHours (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.PricePerHours
            ELSE NULL
          END AS pricePerHours,
          -- PricePerSession (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.PricePerSession
            ELSE NULL
          END AS pricePerSession,
          -- BarPageId for bar profiles
          CASE 
            WHEN EA.EntityType = 'BarPage' THEN BP.BarPageId
            ELSE NULL
          END AS barPageId,
          -- BusinessAccountId for business profiles
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.BussinessAccountId
            ELSE NULL
          END AS businessAccountId
        FROM EntityAccounts EA
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId = @EntityAccountId
      `);
      
      console.log('[ProfileService] _getEntityInfo - Query executed');
      console.log('[ProfileService] _getEntityInfo - Result:', {
        hasResult: !!result,
        hasRecordset: !!(result && result.recordset),
        recordsetLength: result?.recordset?.length || 0
      });
      
      if (!result || !result.recordset || result.recordset.length === 0) {
        console.log('[ProfileService] _getEntityInfo - No entity found for entityAccountId:', entityAccountId);
        return null;
      }
      
      const entityInfo = result.recordset[0];
      if (entityInfo) {
        const normalizedAddress = normalizeAddressField(entityInfo.address);
        entityInfo.addressText = normalizedAddress.text;
        entityInfo.addressObject = normalizedAddress.object;
        entityInfo.addressRaw = normalizedAddress.raw;
        entityInfo.address = normalizedAddress.text || entityInfo.address;
      }
      console.log('[ProfileService] _getEntityInfo - Entity found:', {
        entityAccountId: entityInfo.EntityAccountId,
        entityType: entityInfo.EntityType,
        name: entityInfo.name,
        hasAvatar: !!entityInfo.avatar
      });
      
      return entityInfo;
    } catch (error) {
      console.error('[ProfileService] Error in _getEntityInfo:', error);
      console.error('[ProfileService] _getEntityInfo - Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Lấy số lượng follower và following.
   */
  async _getFollowStats(pool, entityAccountId) {
    try {
      console.log('[ProfileService] _getFollowStats - Starting with entityAccountId:', entityAccountId);
      const request = pool.request();
      request.input('EntityAccountId', sql.UniqueIdentifier, entityAccountId);
      console.log('[ProfileService] _getFollowStats - Executing SQL query...');
      const result = await request.query(`
        SELECT 
          (SELECT COUNT(*) FROM Follows WHERE FollowingId = @EntityAccountId) AS followersCount,
          (SELECT COUNT(*) FROM Follows WHERE FollowerId = @EntityAccountId) AS followingCount
      `);
      
      console.log('[ProfileService] _getFollowStats - Query executed');
      console.log('[ProfileService] _getFollowStats - Result:', {
        hasResult: !!result,
        hasRecordset: !!(result && result.recordset),
        recordsetLength: result?.recordset?.length || 0
      });
      
      if (!result || !result.recordset || result.recordset.length === 0) {
        console.log('[ProfileService] _getFollowStats - No stats found, returning defaults');
        return { followersCount: 0, followingCount: 0 };
      }
      
      const stats = {
        followersCount: result.recordset[0].followersCount || 0,
        followingCount: result.recordset[0].followingCount || 0
      };
      console.log('[ProfileService] _getFollowStats - Stats:', stats);
      
      return stats;
    } catch (error) {
      console.error('[ProfileService] Error in _getFollowStats:', error);
      console.error('[ProfileService] _getFollowStats - Error details:', {
        message: error.message,
        name: error.name
      });
      // Trả về giá trị mặc định nếu có lỗi
      return { followersCount: 0, followingCount: 0 };
    }
  }

  /**
   * Kiểm tra trạng thái follow của user hiện tại đối với entity được xem.
   */
  async _getFollowStatus(pool, followerId, followingId) {
    console.log('[ProfileService] _getFollowStatus - Starting with:', { followerId, followingId });
    if (!followerId || !followingId || followerId === followingId) {
      console.log('[ProfileService] _getFollowStatus - Skipping query (invalid IDs or same user)');
      return { isFollowing: false };
    }
    try {
      const request = pool.request();
      request.input('FollowerEntityId', sql.UniqueIdentifier, followerId);
      request.input('FollowingEntityId', sql.UniqueIdentifier, followingId);
      console.log('[ProfileService] _getFollowStatus - Executing SQL query...');
      const result = await request.query(`
        SELECT COUNT(*) as count FROM Follows WHERE FollowerId = @FollowerEntityId AND FollowingId = @FollowingEntityId
      `);
      
      console.log('[ProfileService] _getFollowStatus - Query executed');
      console.log('[ProfileService] _getFollowStatus - Result:', {
        hasResult: !!result,
        hasRecordset: !!(result && result.recordset),
        recordsetLength: result?.recordset?.length || 0
      });
      
      // Kiểm tra xem recordset có tồn tại và có phần tử không trước khi truy cập
      if (result.recordset && result.recordset.length > 0) {
        const isFollowing = result.recordset[0].count > 0;
        console.log('[ProfileService] _getFollowStatus - isFollowing:', isFollowing);
        return { isFollowing };
      }
      // Nếu không có kết quả, mặc định là chưa follow
      console.log('[ProfileService] _getFollowStatus - No result, returning false');
      return { isFollowing: false };
    } catch (error) {
      console.error('[ProfileService] Error in _getFollowStatus:', error);
      console.error('[ProfileService] _getFollowStatus - Error details:', {
        message: error.message,
        name: error.name
      });
      return { isFollowing: false };
    }
  }

  async getProfileData({ entityId, currentEntityId }) {
    const startTime = Date.now();
    try {
      console.log('[ProfileService] ===== GET PROFILE DATA =====');
      console.log('[ProfileService] Input params:', { entityId, currentEntityId });
      
      console.log('[ProfileService] Getting database pool...');
      const pool = await getPool();
      console.log('[ProfileService] Database pool obtained');

      console.log('[ProfileService] Starting parallel queries...');
      // Thực thi các truy vấn song song
      const [entityInfo, followStats, followStatus, postsResult] = await Promise.all([
        this._getEntityInfo(pool, entityId).catch(err => {
          console.error('[ProfileService] _getEntityInfo failed:', err);
          throw err;
        }),
        this._getFollowStats(pool, entityId).catch(err => {
          console.error('[ProfileService] _getFollowStats failed:', err);
          // Return default stats instead of throwing
          return { followersCount: 0, followingCount: 0 };
        }),
        this._getFollowStatus(pool, currentEntityId, entityId).catch(err => {
          console.error('[ProfileService] _getFollowStatus failed:', err);
          // Return default status instead of throwing
          return { isFollowing: false };
        }),
        postService.getPostsByEntityAccountId(entityId, { limit: 12 }).catch(err => {
          console.error('[ProfileService] Error fetching posts:', err);
          console.error('[ProfileService] Posts error details:', {
            message: err.message,
            name: err.name,
            stack: err.stack
          });
          return { success: false, data: [], nextCursor: null, hasMore: false };
        })
      ]);

      console.log('[ProfileService] All queries completed');
      console.log('[ProfileService] Results:', {
        hasEntityInfo: !!entityInfo,
        hasFollowStats: !!followStats,
        hasFollowStatus: !!followStatus,
        hasPostsResult: !!postsResult,
        postsSuccess: postsResult?.success
      });

      if (!entityInfo) {
        console.error('[ProfileService] Entity not found for entityId:', entityId);
        // Kiểm tra xem entityId có tồn tại trong EntityAccounts không
        try {
          const checkRequest = pool.request();
          checkRequest.input('EntityAccountId', sql.UniqueIdentifier, entityId);
          const checkResult = await checkRequest.query(`
            SELECT EntityAccountId, EntityType, EntityId 
            FROM EntityAccounts 
            WHERE EntityAccountId = @EntityAccountId
          `);
          if (checkResult.recordset.length === 0) {
            console.error('[ProfileService] EntityAccountId does not exist in EntityAccounts table');
            throw new Error(`Profile not found: EntityAccountId ${entityId} does not exist`);
          } else {
            console.error('[ProfileService] EntityAccountId exists but join query returned no results');
            console.error('[ProfileService] EntityAccount details:', checkResult.recordset[0]);
            throw new Error(`Profile not found: Unable to retrieve profile data for EntityAccountId ${entityId}`);
          }
        } catch (checkError) {
          if (checkError.message.includes('Profile not found')) {
            throw checkError;
          }
          console.error('[ProfileService] Error checking entity existence:', checkError);
          throw new Error(`Profile not found: EntityAccountId ${entityId} does not exist or is invalid`);
        }
      }

      console.log('[ProfileService] Merging results...');
      // Gộp kết quả
      const profileData = {
        ...entityInfo,
        ...followStats,
        ...followStatus,
        posts: postsResult && postsResult.success ? (postsResult.data || []) : [],
        postsPagination: postsResult && postsResult.success ? { 
          nextCursor: postsResult.nextCursor || null, 
          hasMore: postsResult.hasMore || false 
        } : { nextCursor: null, hasMore: false },
      };

      console.log('[ProfileService] Profile data merged successfully');
      console.log('[ProfileService] Profile data keys:', Object.keys(profileData));
      console.log('[ProfileService] Total time:', Date.now() - startTime, 'ms');
      console.log('[ProfileService] ===== GET PROFILE DATA SUCCESS =====');

      return profileData;

    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error('[ProfileService] ===== GET PROFILE DATA ERROR =====');
      console.error('[ProfileService] Error fetching profile data:', error);
      console.error('[ProfileService] Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      console.error('[ProfileService] Input params:', { entityId, currentEntityId });
      console.error('[ProfileService] Error time:', errorTime, 'ms');
      throw error; // Re-throw để controller bắt
    }
  }
}

module.exports = new ProfileService();
