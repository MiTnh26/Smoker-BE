const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo sync log mới
 */
async function createSyncLog({
  userAdId,
  reviveBannerId,
  impressions = 0,
  clicks = 0,
  spend = 0,
  ctr = null,
  syncType = 'stats',
  syncStatus = 'success',
  errorMessage = null,
  syncStartDate = null,
  syncEndDate = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("ReviveBannerId", sql.NVarChar(100), reviveBannerId)
    .input("Impressions", sql.Int, impressions)
    .input("Clicks", sql.Int, clicks)
    .input("Spend", sql.Decimal(18,4), spend)
    .input("CTR", sql.Decimal(5,2), ctr)
    .input("SyncType", sql.NVarChar(50), syncType)
    .input("SyncStatus", sql.NVarChar(50), syncStatus)
    .input("ErrorMessage", sql.NVarChar(sql.MAX), errorMessage)
    .input("SyncStartDate", sql.DateTime2, syncStartDate)
    .input("SyncEndDate", sql.DateTime2, syncEndDate)
    .query(`
      INSERT INTO AdSyncLogs
        (SyncLogId, UserAdId, ReviveBannerId, Impressions, Clicks, Spend, CTR,
         SyncType, SyncStatus, ErrorMessage, SyncedAt, SyncStartDate, SyncEndDate)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @UserAdId, @ReviveBannerId, @Impressions, @Clicks, @Spend, @CTR,
         @SyncType, @SyncStatus, @ErrorMessage, GETDATE(), @SyncStartDate, @SyncEndDate)
    `);
  return result.recordset[0];
}

/**
 * Lấy sync logs của một ad
 */
async function getSyncLogsByUserAdId(userAdId, limit = 50) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit) *
      FROM AdSyncLogs
      WHERE UserAdId = @UserAdId
      ORDER BY SyncedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy sync log mới nhất của một ad
 */
async function getLatestSyncLog(userAdId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT TOP 1 *
      FROM AdSyncLogs
      WHERE UserAdId = @UserAdId
      ORDER BY SyncedAt DESC
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy sync logs với filter (cho admin dashboard)
 */
async function getAllSyncLogs({ 
  userAdId, 
  syncStatus, 
  syncType, 
  startDate, 
  endDate, 
  limit = 50, 
  offset = 0 
} = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (userAdId) {
    request.input("UserAdId", sql.UniqueIdentifier, userAdId);
    whereConditions.push("sl.UserAdId = @UserAdId");
  }
  
  if (syncStatus) {
    request.input("SyncStatus", sql.NVarChar(50), syncStatus);
    whereConditions.push("sl.SyncStatus = @SyncStatus");
  }
  
  if (syncType) {
    request.input("SyncType", sql.NVarChar(50), syncType);
    whereConditions.push("sl.SyncType = @SyncType");
  }
  
  if (startDate) {
    request.input("StartDate", sql.DateTime2, startDate);
    whereConditions.push("sl.SyncedAt >= @StartDate");
  }
  
  if (endDate) {
    request.input("EndDate", sql.DateTime2, endDate);
    whereConditions.push("sl.SyncedAt <= @EndDate");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT 
      sl.*,
      ua.Title AS AdTitle,
      bp.BarName
    FROM AdSyncLogs sl
    LEFT JOIN UserAdvertisements ua ON sl.UserAdId = ua.UserAdId
    LEFT JOIN BarPages bp ON ua.BarPageId = bp.BarPageId
    ${whereClause}
    ORDER BY sl.SyncedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Lấy thống kê sync logs (cho admin dashboard)
 */
async function getSyncLogStats({ startDate = null, endDate = null } = {}) {
  const pool = await getPool();
  const request = pool.request();
  
  let whereConditions = [];
  
  if (startDate) {
    request.input("StartDate", sql.DateTime2, startDate);
    whereConditions.push("SyncedAt >= @StartDate");
  }
  
  if (endDate) {
    request.input("EndDate", sql.DateTime2, endDate);
    whereConditions.push("SyncedAt <= @EndDate");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT 
      COUNT(*) AS TotalSyncs,
      SUM(CASE WHEN SyncStatus = 'success' THEN 1 ELSE 0 END) AS SuccessfulSyncs,
      SUM(CASE WHEN SyncStatus = 'failed' THEN 1 ELSE 0 END) AS FailedSyncs,
      SUM(Impressions) AS TotalImpressions,
      SUM(Clicks) AS TotalClicks,
      SUM(Spend) AS TotalSpend,
      AVG(CAST(CTR AS DECIMAL(5,2))) AS AvgCTR
    FROM AdSyncLogs
    ${whereClause}
  `);
  
  return result.recordset[0] || {
    TotalSyncs: 0,
    SuccessfulSyncs: 0,
    FailedSyncs: 0,
    TotalImpressions: 0,
    TotalClicks: 0,
    TotalSpend: 0,
    AvgCTR: 0
  };
}

/**
 * Lấy sync logs failed (để retry)
 */
async function getFailedSyncLogs(limit = 100) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit) *
      FROM AdSyncLogs
      WHERE SyncStatus = 'failed'
      ORDER BY SyncedAt ASC
    `);
  return result.recordset;
}

module.exports = {
  createSyncLog,
  getSyncLogsByUserAdId,
  getLatestSyncLog,
  getAllSyncLogs,
  getSyncLogStats,
  getFailedSyncLogs
};


