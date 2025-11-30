const sql = require("mssql");
const { getPool } = require("../db/sqlserver");

/**
 * Lấy danh sách bars có events mới trong khoảng thời gian, sắp xếp theo rating
 * @param {Object} options
 * @param {number} options.hoursFromNow - Số giờ từ bây giờ (mặc định 168 = 7 ngày)
 * @param {number} options.skip - Số bản ghi bỏ qua
 * @param {number} options.take - Số bản ghi lấy
 * @returns {Promise<Array>}
 */
async function getBarsWithNewEvents({ hoursFromNow = 168, skip = 0, take = 20 } = {}) {
  const pool = await getPool();
  const now = new Date();
  const futureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);

  const result = await pool.request()
    .input("Now", sql.DateTime2, now)
    .input("FutureTime", sql.DateTime2, futureTime)
    .input("Skip", sql.Int, skip)
    .input("Take", sql.Int, take)
    .query(`
      SELECT DISTINCT
        b.BarPageId,
        b.BarName,
        b.Avatar,
        b.Background,
        b.Address,
        b.PhoneNumber,
        b.Email,
        b.Role,
        b.Status,
        b.created_at,
        ea.EntityAccountId,
        
        -- Rating info
        COUNT(DISTINCT br.BarReviewId) AS ReviewCount,
        AVG(CAST(br.Star AS FLOAT)) AS AverageRating,
        
        -- Event info (event mới nhất)
        MAX(e.StartTime) AS LatestEventStartTime,
        COUNT(DISTINCT e.EventId) AS EventCount,
        MIN(e.StartTime) AS NearestEventStartTime
        
      FROM dbo.BarPages b
      INNER JOIN dbo.Events e 
        ON e.BarPageId = b.BarPageId 
        AND e.Status = 'active'
        AND e.StartTime >= @Now 
        AND e.StartTime <= @FutureTime
      LEFT JOIN dbo.EntityAccounts ea 
        ON ea.EntityType = 'BarPage' 
        AND ea.EntityId = b.BarPageId
      LEFT JOIN dbo.BarReviews br 
        ON br.BarId = b.BarPageId
      WHERE b.Status = 'active'
      GROUP BY 
        b.BarPageId,
        b.BarName,
        b.Avatar,
        b.Background,
        b.Address,
        b.PhoneNumber,
        b.Email,
        b.Role,
        b.Status,
        b.created_at,
        ea.EntityAccountId
      ORDER BY 
        COALESCE(AVG(CAST(br.Star AS FLOAT)), 0) DESC,  -- Rating cao nhất trước
        COUNT(DISTINCT br.BarReviewId) DESC,             -- Nhiều review hơn
        MIN(e.StartTime) ASC,                            -- Event gần nhất
        COUNT(DISTINCT e.EventId) DESC                    -- Nhiều events hơn
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    `);

  return result.recordset || [];
}

/**
 * Lấy tổng số bars có events mới trong khoảng thời gian
 * @param {Object} options
 * @param {number} options.hoursFromNow - Số giờ từ bây giờ (mặc định 168 = 7 ngày)
 * @returns {Promise<number>}
 */
async function getBarsWithNewEventsCount({ hoursFromNow = 168 } = {}) {
  const pool = await getPool();
  const now = new Date();
  const futureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);

  const result = await pool.request()
    .input("Now", sql.DateTime2, now)
    .input("FutureTime", sql.DateTime2, futureTime)
    .query(`
      SELECT COUNT(DISTINCT b.BarPageId) AS Total
      FROM dbo.BarPages b
      INNER JOIN dbo.Events e 
        ON e.BarPageId = b.BarPageId 
        AND e.Status = 'active'
        AND e.StartTime >= @Now 
        AND e.StartTime <= @FutureTime
      WHERE b.Status = 'active'
    `);

  return result.recordset[0]?.Total || 0;
}

/**
 * Lấy events của bars có events mới (kèm thông tin bar và rating)
 * @param {Object} options
 * @param {number} options.hoursFromNow - Số giờ từ bây giờ
 * @param {number} options.skip - Số bản ghi bỏ qua
 * @param {number} options.take - Số bản ghi lấy
 * @returns {Promise<Array>}
 */
async function getEventsWithBarRating({ hoursFromNow = 168, skip = 0, take = 20 } = {}) {
  const pool = await getPool();
  const now = new Date();
  const futureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);

  const result = await pool.request()
    .input("Now", sql.DateTime2, now)
    .input("FutureTime", sql.DateTime2, futureTime)
    .input("Skip", sql.Int, skip)
    .input("Take", sql.Int, take)
    .query(`
      SELECT 
        e.EventId,
        e.BarPageId,
        e.EventName,
        e.Description,
        e.Picture,
        e.StartTime,
        e.EndTime,
        e.Status,
        e.CreatedAt,
        e.UpdatedAt,
        
        -- Bar info
        b.BarName,
        b.Avatar AS BarAvatar,
        b.Background AS BarBackground,
        b.Address AS BarAddress,
        b.PhoneNumber AS BarPhone,
        b.Email AS BarEmail,
        b.Role AS BarRole,
        ea.EntityAccountId,
        
        -- Bar rating
        COUNT(DISTINCT br.BarReviewId) AS BarReviewCount,
        AVG(CAST(br.Star AS FLOAT)) AS BarAverageRating
        
      FROM dbo.Events e
      INNER JOIN dbo.BarPages b 
        ON e.BarPageId = b.BarPageId
      LEFT JOIN dbo.EntityAccounts ea 
        ON ea.EntityType = 'BarPage' 
        AND ea.EntityId = b.BarPageId
      LEFT JOIN dbo.BarReviews br 
        ON br.BarId = b.BarPageId
      WHERE e.Status = 'active'
        AND b.Status = 'active'
        AND e.StartTime >= @Now 
        AND e.StartTime <= @FutureTime
      GROUP BY 
        e.EventId,
        e.BarPageId,
        e.EventName,
        e.Description,
        e.Picture,
        e.StartTime,
        e.EndTime,
        e.Status,
        e.CreatedAt,
        e.UpdatedAt,
        b.BarName,
        b.Avatar,
        b.Background,
        b.Address,
        b.PhoneNumber,
        b.Email,
        b.Role,
        ea.EntityAccountId
      ORDER BY 
        COALESCE(AVG(CAST(br.Star AS FLOAT)), 0) DESC,  -- Rating cao nhất trước
        COUNT(DISTINCT br.BarReviewId) DESC,             -- Nhiều review hơn
        e.StartTime ASC                                  -- Event gần nhất
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    `);

  return result.recordset || [];
}

/**
 * Lấy tổng số events trong khoảng thời gian
 * @param {Object} options
 * @param {number} options.hoursFromNow - Số giờ từ bây giờ
 * @returns {Promise<number>}
 */
async function getEventsWithBarRatingCount({ hoursFromNow = 168 } = {}) {
  const pool = await getPool();
  const now = new Date();
  const futureTime = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);

  const result = await pool.request()
    .input("Now", sql.DateTime2, now)
    .input("FutureTime", sql.DateTime2, futureTime)
    .query(`
      SELECT COUNT(1) AS Total
      FROM dbo.Events e
      INNER JOIN dbo.BarPages b 
        ON e.BarPageId = b.BarPageId
      WHERE e.Status = 'active'
        AND b.Status = 'active'
        AND e.StartTime >= @Now 
        AND e.StartTime <= @FutureTime
    `);

  return result.recordset[0]?.Total || 0;
}

module.exports = {
  getBarsWithNewEvents,
  getBarsWithNewEventsCount,
  getEventsWithBarRating,
  getEventsWithBarRatingCount,
};

