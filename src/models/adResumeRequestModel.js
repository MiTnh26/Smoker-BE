const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo yêu cầu tiếp tục quảng cáo (từ BarPage)
 */
async function createResumeRequest({ userAdId, barPageId, accountId, reason, requestNote }) {
  const pool = await getPool();
  const crypto = require('crypto');
  const resumeRequestId = crypto.randomUUID();
  
  await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("Reason", sql.NVarChar(sql.MAX), reason || null)
    .input("RequestNote", sql.NVarChar(sql.MAX), requestNote || null)
    .query(`
      INSERT INTO AdResumeRequests
        (ResumeRequestId, UserAdId, BarPageId, AccountId, Reason, RequestNote, Status, CreatedAt, UpdatedAt)
      VALUES
        (@ResumeRequestId, @UserAdId, @BarPageId, @AccountId, @Reason, @RequestNote, 'pending', GETDATE(), GETDATE())
    `);
  
  const result = await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .query(`
      SELECT rr.*,
        ua.Title AS AdTitle,
        ua.ReviveBannerId,
        bp.BarName
      FROM AdResumeRequests rr
      INNER JOIN UserAdvertisements ua ON rr.UserAdId = ua.UserAdId
      INNER JOIN BarPages bp ON rr.BarPageId = bp.BarPageId
      WHERE rr.ResumeRequestId = @ResumeRequestId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Lấy yêu cầu resume theo ID
 */
async function findById(resumeRequestId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .query(`
      SELECT rr.*,
        ua.Title AS AdTitle,
        ua.ImageUrl AS AdImageUrl,
        ua.Status AS AdStatus,
        ua.ReviveBannerId,
        ua.ReviveCampaignId,
        ua.ReviveZoneId,
        ua.TotalImpressions,
        ua.TotalClicks,
        bp.BarName,
        a.Email AS AccountEmail,
        admin.Email AS AdminEmail
      FROM AdResumeRequests rr
      INNER JOIN UserAdvertisements ua ON rr.UserAdId = ua.UserAdId
      INNER JOIN BarPages bp ON rr.BarPageId = bp.BarPageId
      INNER JOIN Accounts a ON rr.AccountId = a.AccountId
      LEFT JOIN Accounts admin ON rr.AdminProcessedBy = admin.AccountId
      WHERE rr.ResumeRequestId = @ResumeRequestId
    `);
  
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả yêu cầu resume của một BarPage
 */
async function getByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT rr.*,
        ua.Title AS AdTitle,
        ua.ImageUrl AS AdImageUrl,
        ua.Status AS AdStatus,
        ua.ReviveBannerId
      FROM AdResumeRequests rr
      INNER JOIN UserAdvertisements ua ON rr.UserAdId = ua.UserAdId
      WHERE rr.BarPageId = @BarPageId
      ORDER BY rr.CreatedAt DESC
    `);
  
  return result.recordset;
}

/**
 * Lấy tất cả yêu cầu resume (cho admin)
 */
async function getAllResumeRequests({ status, limit = 50, offset = 0 } = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("rr.Status = @Status");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT rr.*,
      ua.Title AS AdTitle,
      ua.ImageUrl AS AdImageUrl,
      ua.Status AS AdStatus,
      ua.ReviveBannerId,
      ua.ReviveCampaignId,
      ua.ReviveZoneId,
      bp.BarName,
      a.Email AS AccountEmail,
      admin.Email AS AdminEmail
    FROM AdResumeRequests rr
    INNER JOIN UserAdvertisements ua ON rr.UserAdId = ua.UserAdId
    INNER JOIN BarPages bp ON rr.BarPageId = bp.BarPageId
    INNER JOIN Accounts a ON rr.AccountId = a.AccountId
    LEFT JOIN Accounts admin ON rr.AdminProcessedBy = admin.AccountId
    ${whereClause}
    ORDER BY rr.CreatedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Admin approve resume request (sau khi đã resume trên Revive)
 */
async function approveResumeRequest(resumeRequestId, adminAccountId, { adminNote, reviveResumed = true } = {}) {
  const pool = await getPool();
  
  await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("AdminNote", sql.NVarChar(sql.MAX), adminNote || null)
    .input("ReviveResumed", sql.Bit, reviveResumed)
    .query(`
      UPDATE AdResumeRequests
      SET Status = 'approved',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          AdminNote = @AdminNote,
          ReviveResumed = @ReviveResumed,
          ReviveResumedAt = CASE WHEN @ReviveResumed = 1 THEN GETDATE() ELSE NULL END,
          UpdatedAt = GETDATE()
      WHERE ResumeRequestId = @ResumeRequestId
    `);
  
  // Update UserAdvertisement status to 'active'
  await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .query(`
      UPDATE ua
      SET ua.Status = 'active',
          ua.UpdatedAt = GETDATE()
      FROM UserAdvertisements ua
      INNER JOIN AdResumeRequests rr ON ua.UserAdId = rr.UserAdId
      WHERE rr.ResumeRequestId = @ResumeRequestId
    `);
  
  return await findById(resumeRequestId);
}

/**
 * Admin reject resume request
 */
async function rejectResumeRequest(resumeRequestId, adminAccountId, adminNote) {
  const pool = await getPool();
  
  await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .input("AdminNote", sql.NVarChar(sql.MAX), adminNote || null)
    .query(`
      UPDATE AdResumeRequests
      SET Status = 'rejected',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          AdminNote = @AdminNote,
          UpdatedAt = GETDATE()
      WHERE ResumeRequestId = @ResumeRequestId
    `);
  
  return await findById(resumeRequestId);
}

/**
 * Complete resume request (khi đã hoàn tất resume trên Revive và cập nhật hệ thống)
 */
async function completeResumeRequest(resumeRequestId, adminAccountId) {
  const pool = await getPool();
  
  await pool.request()
    .input("ResumeRequestId", sql.UniqueIdentifier, resumeRequestId)
    .input("AdminAccountId", sql.UniqueIdentifier, adminAccountId)
    .query(`
      UPDATE AdResumeRequests
      SET Status = 'completed',
          AdminProcessedBy = @AdminAccountId,
          AdminProcessedAt = GETDATE(),
          ReviveResumed = 1,
          ReviveResumedAt = GETDATE(),
          UpdatedAt = GETDATE()
      WHERE ResumeRequestId = @ResumeRequestId
    `);
  
  return await findById(resumeRequestId);
}

/**
 * Kiểm tra xem có yêu cầu resume đang pending cho một ad không
 */
async function hasPendingRequest(userAdId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT TOP 1 ResumeRequestId
      FROM AdResumeRequests
      WHERE UserAdId = @UserAdId
        AND Status = 'pending'
    `);
  
  return result.recordset.length > 0;
}

module.exports = {
  createResumeRequest,
  findById,
  getByBarPageId,
  getAllResumeRequests,
  approveResumeRequest,
  rejectResumeRequest,
  completeResumeRequest,
  hasPendingRequest
};

