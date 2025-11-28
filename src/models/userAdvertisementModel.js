const { getPool, sql } = require("../db/sqlserver");

/**
 * Kiểm tra user có phải BarPage không
 */
async function isBarPage(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT TOP 1 1
      FROM BarPages
      WHERE AccountId = @AccountId
    `);
  return result.recordset.length > 0;
}

/**
 * Tạo quảng cáo mới (chỉ BarPage mới được tạo)
 */
async function createUserAd({ barPageId, accountId, title, description, imageUrl, redirectUrl }) {
  const pool = await getPool();
  
  // Verify BarPage thuộc về AccountId
  const verifyResult = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT TOP 1 BarPageId
      FROM BarPages
      WHERE BarPageId = @BarPageId AND AccountId = @AccountId
    `);
  
  if (verifyResult.recordset.length === 0) {
    throw new Error("BarPage not found or access denied");
  }
  
  // Generate UUID before insert
  const crypto = require('crypto');
  const userAdId = crypto.randomUUID();
  
  await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("Title", sql.NVarChar(255), title)
    .input("Description", sql.NVarChar(sql.MAX), description || null)
    .input("ImageUrl", sql.NVarChar(sql.MAX), imageUrl)
    .input("RedirectUrl", sql.NVarChar(sql.MAX), redirectUrl)
    .query(`
      INSERT INTO UserAdvertisements
        (UserAdId, BarPageId, AccountId, Title, Description, ImageUrl, RedirectUrl, Status, CreatedAt, UpdatedAt)
      VALUES
        (@UserAdId, @BarPageId, @AccountId, @Title, @Description, @ImageUrl, @RedirectUrl, 'pending', GETDATE(), GETDATE())
    `);
  
  // Query the newly created record
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT *
      FROM UserAdvertisements
      WHERE UserAdId = @UserAdId
    `);
  
  return result.recordset[0];
}

/**
 * Lấy ads của một BarPage (bao gồm thông tin cho auction)
 */
async function getAdsByBarPage(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT
        ua.*,
        -- Thông tin package để tính budget multiplier
        COALESCE(ap.Price, 0) AS PackagePrice,
        -- Thông tin BarPage
        bp.BarName,
        bp.Email AS BarEmail
      FROM UserAdvertisements ua
      LEFT JOIN AdPurchases ap ON ua.UserAdId = ap.UserAdId AND ap.Status = 'active'
      LEFT JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
      WHERE ua.BarPageId = @BarPageId
      ORDER BY ua.CreatedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy ads của một Account (BarPage)
 */
async function getAdsByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT *
      FROM UserAdvertisements
      WHERE AccountId = @AccountId
      ORDER BY CreatedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy ads pending approval (cho admin)
 */
async function getPendingAds(limit = 50) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit)
        ua.*,
        bp.BarName,
        bp.Email AS BarEmail,
        a.Email AS AccountEmail,
        a.UserName AS AccountUserName
      FROM UserAdvertisements ua
      INNER JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
      INNER JOIN Accounts a ON ua.AccountId = a.AccountId
      WHERE ua.Status = 'pending'
      ORDER BY ua.CreatedAt ASC
    `);
  return result.recordset;
}

/**
 * Tìm ad theo ID
 */
async function findById(userAdId) {
  if (!userAdId) {
    return null;
  }
  
  // Validate UUID format before querying
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userAdId)) {
    console.warn(`[userAdvertisementModel] Invalid UUID format for UserAdId: ${userAdId}`);
    return null;
  }
  
  const pool = await getPool();
  try {
    const result = await pool.request()
      .input("UserAdId", sql.UniqueIdentifier, userAdId)
      .query(`
        SELECT ua.*,
          bp.BarName,
          a.Email AS AccountEmail
        FROM UserAdvertisements ua
        LEFT JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
        LEFT JOIN Accounts a ON ua.AccountId = a.AccountId
        WHERE ua.UserAdId = @UserAdId
      `);
    return result.recordset[0] || null;
  } catch (error) {
    // Handle GUID validation errors gracefully
    if (error.message && error.message.includes("Invalid GUID")) {
      console.warn(`[userAdvertisementModel] GUID validation error for UserAdId: ${userAdId}`, error.message);
      return null;
    }
    throw error;
  }
}

/**
 * Admin approve ad (sau khi set lên Revive)
 */
async function approveAd(userAdId, adminAccountId, { 
  reviveBannerId, 
  reviveCampaignId, 
  reviveZoneId, 
  pricingModel, 
  bidAmount 
} = {}) {
  const pool = await getPool();
  
  await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("ReviveBannerId", sql.NVarChar(100), reviveBannerId || null)
    .input("ReviveCampaignId", sql.NVarChar(100), reviveCampaignId || null)
    .input("ReviveZoneId", sql.NVarChar(100), reviveZoneId || null)
    .input("PricingModel", sql.NVarChar(50), pricingModel || null)
    .input("BidAmount", sql.Decimal(18,2), bidAmount || null)
    .query(`
      UPDATE UserAdvertisements
      SET Status = 'approved',
          ReviveBannerId = ISNULL(@ReviveBannerId, ReviveBannerId),
          ReviveCampaignId = ISNULL(@ReviveCampaignId, ReviveCampaignId),
          ReviveZoneId = ISNULL(@ReviveZoneId, ReviveZoneId),
          PricingModel = ISNULL(@PricingModel, PricingModel),
          BidAmount = ISNULL(@BidAmount, BidAmount),
          AdminApprovedBy = @AdminAccountId,
          AdminApprovedAt = GETDATE(),
          UpdatedAt = GETDATE()
      WHERE UserAdId = @UserAdId
    `);
  
  // Query the updated record
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT *
      FROM UserAdvertisements
      WHERE UserAdId = @UserAdId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Admin reject ad
 */
async function rejectAd(userAdId, adminAccountId, reason) {
  const pool = await getPool();
  
  await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("Reason", sql.NVarChar(sql.MAX), reason || null)
    .query(`
      UPDATE UserAdvertisements
      SET Status = 'rejected',
          AdminRejectedReason = @Reason,
          AdminApprovedBy = @AdminAccountId,
          AdminApprovedAt = GETDATE(),
          UpdatedAt = GETDATE()
      WHERE UserAdId = @UserAdId
    `);
  
  // Query the updated record
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT *
      FROM UserAdvertisements
      WHERE UserAdId = @UserAdId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Update ad status và stats
 */
async function updateAdStatus(userAdId, { 
  status, 
  usedImpressions, 
  remainingImpressions, 
  totalImpressions, 
  totalClicks, 
  totalSpent 
} = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId);
  
  const updates = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    updates.push("Status = @Status");
  }
  if (usedImpressions !== undefined) {
    request.input("UsedImpressions", sql.Int, usedImpressions);
    updates.push("UsedImpressions = @UsedImpressions");
  }
  if (remainingImpressions !== undefined) {
    request.input("RemainingImpressions", sql.Int, remainingImpressions);
    updates.push("RemainingImpressions = @RemainingImpressions");
  }
  if (totalImpressions !== undefined) {
    request.input("TotalImpressions", sql.Int, totalImpressions);
    updates.push("TotalImpressions = @TotalImpressions");
  }
  if (totalClicks !== undefined) {
    request.input("TotalClicks", sql.Int, totalClicks);
    updates.push("TotalClicks = @TotalClicks");
  }
  if (totalSpent !== undefined) {
    request.input("TotalSpent", sql.Decimal(18,2), totalSpent);
    updates.push("TotalSpent = @TotalSpent");
  }
  
  if (updates.length === 0) {
    throw new Error("No fields to update");
  }
  
  updates.push("UpdatedAt = GETDATE()");
  
  await request.query(`
    UPDATE UserAdvertisements
    SET ${updates.join(", ")}
    WHERE UserAdId = @UserAdId
  `);
  
  // Query the updated record
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT *
      FROM UserAdvertisements
      WHERE UserAdId = @UserAdId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả ads với filter (cho admin dashboard)
 */
async function getAllAds({ status, barPageId, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("ua.Status = @Status");
  }
  
  if (barPageId) {
    request.input("BarPageId", sql.UniqueIdentifier, barPageId);
    whereConditions.push("ua.BarPageId = @BarPageId");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT 
      ua.*,
      bp.BarName,
      a.Email AS AccountEmail
    FROM UserAdvertisements ua
    LEFT JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
    LEFT JOIN Accounts a ON ua.AccountId = a.AccountId
    ${whereClause}
    ORDER BY ua.CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Lấy UserAdvertisement theo ReviveBannerId
 */
async function findByReviveBannerId(reviveBannerId) {
  if (!reviveBannerId) {
    console.warn(`[userAdvertisementModel] findByReviveBannerId called with null/undefined bannerId`);
    return null;
  }

  // Convert to string để đảm bảo so sánh đúng
  const bannerIdStr = String(reviveBannerId).trim();
  
  console.log(`[userAdvertisementModel] Finding UserAd with ReviveBannerId: "${bannerIdStr}"`);
  
  const pool = await getPool();
  const result = await pool.request()
    .input("ReviveBannerId", sql.NVarChar(100), bannerIdStr)
    .query(`
      SELECT ua.*,
        bp.BarName,
        bp.Avatar AS BarAvatar,
        ea.EntityAccountId AS BarEntityAccountId
      FROM UserAdvertisements ua
      LEFT JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
      LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
      WHERE ua.ReviveBannerId = @ReviveBannerId
        AND ua.Status = 'active'
    `);
  
  if (result.recordset.length > 0) {
    console.log(`[userAdvertisementModel] ✅ Found UserAd: ${result.recordset[0].UserAdId}`);
    return result.recordset[0];
  } else {
    console.log(`[userAdvertisementModel] ⚠️ No active UserAd found with ReviveBannerId: "${bannerIdStr}"`);
    // Debug: Check if there are any UserAds with this banner ID but different status
    const debugResult = await pool.request()
      .input("ReviveBannerId", sql.NVarChar(100), bannerIdStr)
      .query(`
        SELECT UserAdId, Status, ReviveBannerId, Title
        FROM UserAdvertisements
        WHERE ReviveBannerId = @ReviveBannerId
      `);
    
    if (debugResult.recordset.length > 0) {
      console.log(`[userAdvertisementModel] Debug: Found ${debugResult.recordset.length} UserAd(s) with this banner ID but status is not 'active':`, 
        debugResult.recordset.map(r => ({ UserAdId: r.UserAdId, Status: r.Status })));
    } else {
      console.log(`[userAdvertisementModel] Debug: No UserAd found with ReviveBannerId: "${bannerIdStr}" at all.`);
    }
    
    return null;
  }
}

module.exports = {
  isBarPage,
  createUserAd,
  getAdsByBarPage,
  getAdsByAccountId,
  getPendingAds,
  findById,
  findByReviveBannerId,
  approveAd,
  rejectAd,
  updateAdStatus,
  getAllAds
};


