const { getPool, sql } = require("../db/sqlserver");

async function createImpression({ advertisementId, barPageId, accountId, displayType, ipAddress, userAgent }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AdvertisementId", sql.UniqueIdentifier, advertisementId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AccountId", sql.UniqueIdentifier, accountId || null)
    .input("DisplayType", sql.NVarChar(50), displayType)
    .input("IPAddress", sql.NVarChar(50), ipAddress || null)
    .input("UserAgent", sql.NVarChar(500), userAgent || null)
    .query(`
      INSERT INTO AdDisplayLogs
        (LogId, AdvertisementId, BarPageId, AccountId, DisplayType, DisplayedAt, IPAddress, UserAgent)
      OUTPUT inserted.LogId, inserted.DisplayedAt, inserted.AdvertisementId
      VALUES
        (NEWID(), @AdvertisementId, @BarPageId, @AccountId, @DisplayType, GETDATE(), @IPAddress, @UserAgent);
    `);
  return result.recordset[0];
}

async function markClick(logId) {
  const pool = await getPool();
  
  // First check if log exists
  const checkResult = await pool.request()
    .input("LogId", sql.UniqueIdentifier, logId)
    .query(`
      SELECT TOP 1 * FROM AdDisplayLogs WHERE LogId = @LogId
    `);
  
  if (!checkResult.recordset || checkResult.recordset.length === 0) {
    console.error(`[adDisplayLogModel] Log not found: ${logId}`);
    return null; // Log not found
  }
  
  // Update click timestamp
  const updateResult = await pool.request()
    .input("LogId", sql.UniqueIdentifier, logId)
    .query(`
      UPDATE AdDisplayLogs
      SET ClickedAt = GETDATE()
      WHERE LogId = @LogId
    `);
  
  // Check if update was successful (rows affected > 0)
  if (updateResult.rowsAffected[0] === 0) {
    console.error(`[adDisplayLogModel] No rows updated for logId: ${logId}`);
    return null;
  }
  
  // Get updated log
  const updatedResult = await pool.request()
    .input("LogId", sql.UniqueIdentifier, logId)
    .query(`
      SELECT TOP 1 * FROM AdDisplayLogs WHERE LogId = @LogId
    `);
  
  if (!updatedResult.recordset || updatedResult.recordset.length === 0) {
    console.error(`[adDisplayLogModel] Cannot retrieve updated log: ${logId}`);
    return null;
  }
  
  return updatedResult.recordset[0];
}

async function getStatsByBarPage(barPageId, startDate, endDate) {
  const pool = await getPool();
  
  const request = pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("StartDate", sql.DateTime2, startDate || null)
    .input("EndDate", sql.DateTime2, endDate || null);

  // Query 1: Overview stats (using parameterized query)
  const overviewQuery = `
    SELECT
      COUNT(*) AS TotalImpressions,
      COUNT(ClickedAt) AS TotalClicks,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(COUNT(ClickedAt) AS FLOAT) / COUNT(*) * 100 END AS CTR
        FROM AdDisplayLogs
        WHERE BarPageId = @BarPageId
          AND (@StartDate IS NULL OR DisplayedAt >= @StartDate)
          AND (@EndDate IS NULL OR DisplayedAt <= @EndDate)
  `;

  // Query 2: Stats by date (using parameterized query)
  const byDateQuery = `
      SELECT
        CONVERT(date, DisplayedAt) AS [Date],
        COUNT(*) AS Impressions,
        COUNT(ClickedAt) AS Clicks
    FROM AdDisplayLogs
    WHERE BarPageId = @BarPageId
      AND (@StartDate IS NULL OR DisplayedAt >= @StartDate)
      AND (@EndDate IS NULL OR DisplayedAt <= @EndDate)
      GROUP BY CONVERT(date, DisplayedAt)
    ORDER BY [Date] ASC
  `;

  // Execute both queries separately with same parameters
  const overviewResult = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("StartDate", sql.DateTime2, startDate || null)
    .input("EndDate", sql.DateTime2, endDate || null)
    .query(overviewQuery);

  const byDateResult = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("StartDate", sql.DateTime2, startDate || null)
    .input("EndDate", sql.DateTime2, endDate || null)
    .query(byDateQuery);

  return {
    overview: overviewResult.recordset[0] || { TotalImpressions: 0, TotalClicks: 0, CTR: 0 },
    byDate: byDateResult.recordset || []
  };
}

/**
 * Lấy thống kê theo khoảng thời gian và display type (cho auction stats)
 */
async function getStatsByDateRange(startDate, endDate) {
  const pool = await getPool();

  const request = pool.request()
    .input("StartDate", sql.DateTime2, startDate || null)
    .input("EndDate", sql.DateTime2, endDate || null);

  const query = `
    SELECT
      DisplayType,
      COUNT(*) AS TotalImpressions,
      COUNT(ClickedAt) AS TotalClicks,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(COUNT(ClickedAt) AS FLOAT) / COUNT(*) * 100 END AS CTR
    FROM AdDisplayLogs
    WHERE (@StartDate IS NULL OR DisplayedAt >= @StartDate)
      AND (@EndDate IS NULL OR DisplayedAt <= @EndDate)
    GROUP BY DisplayType
    ORDER BY TotalImpressions DESC
  `;

  const result = await request.query(query);
  return result.recordset;
}

module.exports = {
  createImpression,
  markClick,
  getStatsByBarPage,
  getStatsByDateRange
};