const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo yêu cầu tạm dừng quảng cáo (từ BarPage)
 */
async function createPauseRequest({ userAdId, barPageId, managerId, reason, requestNote }) {
  const pool = await getPool();
  const crypto = require('crypto');
  const pauseRequestId = crypto.randomUUID();
  
  await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("Reason", sql.NVarChar(sql.MAX), reason || null)
    .input("RequestNote", sql.NVarChar(sql.MAX), requestNote || null)
    .query(`
      INSERT INTO AdPauseRequests
        (PauseRequestId, UserAdId, BarPageId, Reason, RequestNote, Status, CreatedAt, UpdatedAt)
      VALUES
        (@PauseRequestId, @UserAdId, @BarPageId, @Reason, @RequestNote, 'pending', GETDATE(), GETDATE())
    `);
  
  const result = await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .query(`
      SELECT pr.*,
        ua.Title AS AdTitle,
        ua.ReviveBannerId,
        bp.BarName
      FROM AdPauseRequests pr
      INNER JOIN UserAdvertisements ua ON pr.UserAdId = ua.UserAdId
      INNER JOIN BarPages bp ON pr.BarPageId = bp.BarPageId
      WHERE pr.PauseRequestId = @PauseRequestId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Lấy yêu cầu pause theo ID
 */
async function findById(pauseRequestId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .query(`
      SELECT pr.*,
        ua.Title AS AdTitle,
        ua.ImageUrl AS AdImageUrl,
        ua.Status AS AdStatus,
        ua.ReviveBannerId,
        ua.ReviveCampaignId,
        ua.ReviveZoneId,
        ua.TotalImpressions,
        ua.TotalClicks,
        bp.BarName,
        bp.Email AS AccountEmail,
        admin.Email AS AdminEmail
      FROM AdPauseRequests pr
      INNER JOIN UserAdvertisements ua ON pr.UserAdId = ua.UserAdId
      INNER JOIN BarPages bp ON pr.BarPageId = bp.BarPageId
      LEFT JOIN Accounts admin ON pr.AdminProcessedBy = admin.AccountId
      WHERE pr.PauseRequestId = @PauseRequestId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả yêu cầu pause của một BarPage
 */
async function getByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT pr.*,
        ua.Title AS AdTitle,
        ua.ImageUrl AS AdImageUrl,
        ua.Status AS AdStatus,
        ua.ReviveBannerId
      FROM AdPauseRequests pr
      INNER JOIN UserAdvertisements ua ON pr.UserAdId = ua.UserAdId
      WHERE pr.BarPageId = @BarPageId
      ORDER BY pr.CreatedAt DESC
    `);
  
  return result.recordset;
}

/**
 * Lấy tất cả yêu cầu pause của một UserAd
 */
async function getByUserAdId(userAdId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT pr.*,
        ua.Title AS AdTitle,
        ua.ImageUrl AS AdImageUrl,
        ua.Status AS AdStatus,
        ua.ReviveBannerId
      FROM AdPauseRequests pr
      INNER JOIN UserAdvertisements ua ON pr.UserAdId = ua.UserAdId
      WHERE pr.UserAdId = @UserAdId
      ORDER BY pr.CreatedAt DESC
    `);
  
  return result.recordset;
}

/**
 * Lấy tất cả yêu cầu pause (cho admin)
 */
async function getAllPauseRequests({ status, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("pr.Status = @Status");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT pr.*,
      ua.Title AS AdTitle,
      ua.ImageUrl AS AdImageUrl,
      ua.Status AS AdStatus,
      ua.ReviveBannerId,
      ua.ReviveCampaignId,
      ua.ReviveZoneId,
      bp.BarName,
      bp.Email AS AccountEmail,
      admin.Email AS AdminEmail
    FROM AdPauseRequests pr
    INNER JOIN UserAdvertisements ua ON pr.UserAdId = ua.UserAdId
    INNER JOIN BarPages bp ON pr.BarPageId = bp.BarPageId
    LEFT JOIN Accounts admin ON pr.AdminProcessedBy = admin.AccountId
    ${whereClause}
    ORDER BY pr.CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Admin approve pause request (sau khi đã pause trên Revive)
 */
async function approvePauseRequest(pauseRequestId, adminAccountId, { adminNote, revivePaused = true } = {}) {
  const pool = await getPool();
  
  console.log(`[adPauseRequestModel] Approving pause request ${pauseRequestId} by admin ${adminAccountId}`);
  
  // Update AdPauseRequests status
  const updateRequestResult = await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("AdminNote", sql.NVarChar(sql.MAX), adminNote || null)
    .input("RevivePaused", sql.Bit, revivePaused)
    .query(`
      UPDATE AdPauseRequests
      SET Status = 'approved',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          AdminNote = @AdminNote,
          RevivePaused = @RevivePaused,
          RevivePausedAt = CASE WHEN @RevivePaused = 1 THEN GETDATE() ELSE NULL END,
          UpdatedAt = GETDATE()
      WHERE PauseRequestId = @PauseRequestId
    `);
  
  const rowsAffected1 = updateRequestResult.rowsAffected[0];
  console.log(`[adPauseRequestModel] Updated AdPauseRequests: ${rowsAffected1} row(s) affected`);
  
  if (rowsAffected1 === 0) {
    throw new Error(`No pause request found with ID ${pauseRequestId} or already processed`);
  }
  
  // Update UserAdvertisement status to 'paused'
  const updateAdResult = await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .query(`
      UPDATE ua
      SET ua.Status = 'paused',
          ua.UpdatedAt = GETDATE()
      FROM UserAdvertisements ua
      INNER JOIN AdPauseRequests pr ON ua.UserAdId = pr.UserAdId
      WHERE pr.PauseRequestId = @PauseRequestId
    `);
  
  const rowsAffected2 = updateAdResult.rowsAffected[0];
  console.log(`[adPauseRequestModel] Updated UserAdvertisements: ${rowsAffected2} row(s) affected`);
  
  if (rowsAffected2 === 0) {
    console.warn(`[adPauseRequestModel] Warning: No UserAdvertisement found for pause request ${pauseRequestId}`);
  } else {
    // Verify the update by querying the UserAdvertisement status
    const verifyResult = await pool.request()
      .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
      .query(`
        SELECT ua.UserAdId, ua.Status, ua.Title
        FROM UserAdvertisements ua
        INNER JOIN AdPauseRequests pr ON ua.UserAdId = pr.UserAdId
        WHERE pr.PauseRequestId = @PauseRequestId
      `);
    
    if (verifyResult.recordset.length > 0) {
      const adStatus = verifyResult.recordset[0].Status;
      console.log(`[adPauseRequestModel] Verified UserAdvertisement status: ${adStatus} (UserAdId: ${verifyResult.recordset[0].UserAdId})`);
      if (adStatus !== 'paused') {
        console.error(`[adPauseRequestModel] ERROR: UserAdvertisement status is ${adStatus}, expected 'paused'!`);
      }
    }
  }
  
  const updatedRequest = await findById(pauseRequestId);
  console.log(`[adPauseRequestModel] Approved pause request ${pauseRequestId}, AdPauseRequest status: ${updatedRequest?.Status}, UserAd status: ${updatedRequest?.AdStatus}`);
  
  return updatedRequest;
}

/**
 * Admin reject pause request
 */
async function rejectPauseRequest(pauseRequestId, adminAccountId, adminNote) {
  const pool = await getPool();
  
  await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("AdminNote", sql.NVarChar(sql.MAX), adminNote || null)
    .query(`
      UPDATE AdPauseRequests
      SET Status = 'rejected',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          AdminNote = @AdminNote,
          UpdatedAt = GETDATE()
      WHERE PauseRequestId = @PauseRequestId
    `);
  
  return await findById(pauseRequestId);
}

/**
 * Complete pause request (khi đã hoàn tất pause trên Revive và cập nhật hệ thống)
 */
async function completePauseRequest(pauseRequestId, adminAccountId) {
  const pool = await getPool();
  
  await pool.request()
    .input("PauseRequestId", sql.UniqueIdentifier, pauseRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .query(`
      UPDATE AdPauseRequests
      SET Status = 'completed',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          RevivePaused = 1,
          RevivePausedAt = GETDATE(),
          UpdatedAt = GETDATE()
      WHERE PauseRequestId = @PauseRequestId
    `);
  
  return await findById(pauseRequestId);
}

/**
 * Kiểm tra xem có yêu cầu pause đang pending cho một ad không
 */
async function hasPendingRequest(userAdId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT TOP 1 PauseRequestId
      FROM AdPauseRequests
      WHERE UserAdId = @UserAdId
        AND Status = 'pending'
    `);
  
  return result.recordset.length > 0;
}

module.exports = {
  createPauseRequest,
  findById,
  getByBarPageId,
  getByUserAdId,
  getAllPauseRequests,
  approvePauseRequest,
  rejectPauseRequest,
  completePauseRequest,
  hasPendingRequest
};

