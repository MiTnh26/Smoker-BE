const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy thông tin BarPage theo ID
 * JOIN với EntityAccounts để lấy EntityAccountId
 */
async function getBarPageById(barPageId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT b.BarPageId, b.AccountId, b.BarName, b.Avatar, b.Background, b.Address, b.PhoneNumber, b.Role, b.Email, b.Status, b.created_at, ea.EntityAccountId
      FROM BarPages b
      LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = b.BarPageId
      WHERE b.BarPageId = @BarPageId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy BarPage theo AccountId (vì mỗi account chỉ có 1 bar page)
 * JOIN với EntityAccounts để lấy EntityAccountId
 */
async function getBarPageByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT b.BarPageId, b.AccountId, b.BarName, b.Avatar, b.Background, b.Address, b.PhoneNumber, b.Role, b.Email, b.Status, b.created_at, ea.EntityAccountId
      FROM BarPages b
      LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = b.BarPageId
      WHERE b.AccountId = @AccountId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy BarPageId từ EntityAccountId
 */
async function getBarPageIdByEntityAccountId(entityAccountId) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
    .query(`
      SELECT ea.EntityId as BarPageId, b.BarName
      FROM EntityAccounts ea
      JOIN BarPages b ON b.BarPageId = ea.EntityId
      WHERE ea.EntityAccountId = @EntityAccountId AND ea.EntityType = 'BarPage'
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy BarPage theo ManagerId
 * JOIN với EntityAccounts để lấy EntityAccountId
 * Tìm BarPageId từ AdPurchases (có ManagerId) hoặc từ BarPages nếu có cột ManagerId
 */
async function getBarPageByManagerId(managerId) {
  const pool = await getPool();
  
  // Method 1: Thử query từ AdPurchases (nếu có ManagerId trong đó)
  try {
    const purchaseResult = await pool
      .request()
      .input("ManagerId", sql.UniqueIdentifier, managerId)
      .query(`
        SELECT TOP 1 ap.BarPageId
        FROM AdPurchases ap
        WHERE ap.ManagerId = @ManagerId
        ORDER BY ap.CreatedAt DESC
      `);
    
    if (purchaseResult.recordset.length > 0) {
      const barPageId = purchaseResult.recordset[0].BarPageId;
      // Lấy BarPage từ BarPageId
      return await getBarPageById(barPageId);
    }
  } catch (error) {
    console.warn("[barPageModel] Error querying from AdPurchases:", error.message);
  }
  
  // Method 2: Thử query trực tiếp từ BarPages nếu có cột ManagerId
  try {
    const result = await pool
      .request()
      .input("ManagerId", sql.UniqueIdentifier, managerId)
      .query(`
        SELECT b.BarPageId, b.AccountId, b.BarName, b.Avatar, b.Background, b.Address, b.PhoneNumber, b.Role, b.Email, b.Status, b.created_at, ea.EntityAccountId
        FROM BarPages b
        LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = b.BarPageId
        WHERE b.ManagerId = @ManagerId
      `);
    if (result.recordset.length > 0) {
      return result.recordset[0];
    }
  } catch (error) {
    // If ManagerId column doesn't exist in BarPages, that's okay
    if (error.message && error.message.includes("Invalid column name 'ManagerId'")) {
      console.warn("[barPageModel] ManagerId column not found in BarPages table, tried AdPurchases");
    } else {
      console.warn("[barPageModel] Error querying BarPages:", error.message);
    }
  }
  
  return null;
}

/**
 * Lấy danh sách BarPage nổi bật kèm rating trung bình và số lượng đánh giá
 * @param {number} limit - số lượng bar cần lấy
 * @returns {Promise<Array>}
 */
async function getFeaturedBarPages(limit = 6) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("limit", sql.Int, limit)
    .query(`
      SELECT TOP (@limit)
        bp.BarPageId,
        bp.AccountId,
        bp.BarName,
        bp.Avatar,
        bp.Background,
        bp.Address,
        bp.PhoneNumber,
        bp.Email,
        bp.Role,
        bp.Status,
        bp.created_at,
        ea.EntityAccountId,
        COUNT(br.BarReviewId) AS ReviewCount,
        AVG(CAST(br.Star AS FLOAT)) AS AverageRating
      FROM BarPages bp
      LEFT JOIN EntityAccounts ea 
        ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
      LEFT JOIN BarReviews br 
        ON br.BarId = bp.BarPageId
      GROUP BY 
        bp.BarPageId,
        bp.AccountId,
        bp.BarName,
        bp.Avatar,
        bp.Background,
        bp.Address,
        bp.PhoneNumber,
        bp.Email,
        bp.Role,
        bp.Status,
        bp.created_at,
        ea.EntityAccountId
      ORDER BY 
        COALESCE(AVG(CAST(br.Star AS FLOAT)), 0) DESC,
        COUNT(br.BarReviewId) DESC,
        bp.created_at DESC
    `);

  return result.recordset || [];
}

/**
 * Tạo mới BarPage
 */
async function createBarPage({
  accountId,
  barName,
  avatar = null,
  background = null,
  address = null,
  phoneNumber = null,
  role = "Bar",
  email = null,
  status = "pending"
}) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("BarName", sql.NVarChar(100), barName)
    .input("Avatar", sql.NVarChar(1000), avatar)
    .input("Background", sql.NVarChar(1000), background)
    .input("Address", sql.NVarChar(255), address)
    .input("PhoneNumber", sql.NVarChar(15), phoneNumber)
    .input("Role", sql.NVarChar(15), role)
    .input("Email", sql.NVarChar(50), email)
    .input("Status", sql.NVarChar(20), status)
    .query(`
      INSERT INTO BarPages (AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email, Status)
      OUTPUT inserted.BarPageId, inserted.AccountId, inserted.BarName, inserted.Role, inserted.Email, inserted.Status
      VALUES (@AccountId, @BarName, @Avatar, @Background, @Address, @PhoneNumber, @Role, @Email, @Status)
    `);

  return result.recordset[0];
}

/**
 * Cập nhật thông tin BarPage
 */
async function updateBarPage(barPageId, { barName, avatar, background, address, phoneNumber, email, status }) {
  const pool = await getPool();
  const request = pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("BarName", sql.NVarChar(100), barName || null)
    .input("Avatar", sql.NVarChar(sql.MAX), avatar || null)      // ✅ sửa ở đây
    .input("Background", sql.NVarChar(sql.MAX), background || null) 
    .input("Address", sql.NVarChar(255), address || null)
    .input("PhoneNumber", sql.NVarChar(15), phoneNumber || null)
    .input("Email", sql.NVarChar(50), email || null)
    .input("Status", sql.NVarChar(20), status || null);

  const result = await request.query(`
    UPDATE BarPages
    SET 
      BarName = COALESCE(@BarName, BarName),
      Avatar = COALESCE(@Avatar, Avatar),
      Background = COALESCE(@Background, Background),
      Address = COALESCE(@Address, Address),
      PhoneNumber = COALESCE(@PhoneNumber, PhoneNumber),
      Email = COALESCE(@Email, Email),
      Status = COALESCE(@Status, Status)
    WHERE BarPageId = @BarPageId;

    SELECT BarPageId, AccountId, BarName, Avatar, Background, Address, PhoneNumber, Role, Email, Status, created_at
    FROM BarPages WHERE BarPageId = @BarPageId;
  `);

  return result.recordset[0] || null;
}

/**
 * Xóa BarPage (nếu cần)
 */
async function deleteBarPage(barPageId) {
  const pool = await getPool();
  await pool
    .request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`DELETE FROM BarPages WHERE BarPageId = @BarPageId`);
  return true;
}

module.exports = {
  getBarPageById,
  getBarPageByAccountId,
  getBarPageByManagerId,
  getBarPageIdByEntityAccountId,
  createBarPage,
  updateBarPage,
  deleteBarPage,
  getFeaturedBarPages,
};
