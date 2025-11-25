const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo purchase record
 */
async function createPurchase({ 
  userAdId, 
  packageId, 
  barPageId, 
  accountId, 
  packageName, 
  packageCode, 
  impressions, 
  price, 
  paymentHistoryId, 
  paymentMethod, 
  paymentId 
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .input("PackageId", sql.UniqueIdentifier, packageId)
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("PackageName", sql.NVarChar(255), packageName)
    .input("PackageCode", sql.NVarChar(100), packageCode)
    .input("Impressions", sql.Int, impressions)
    .input("Price", sql.Decimal(18,2), price)
    .input("PaymentHistoryId", sql.UniqueIdentifier, paymentHistoryId || null)
    .input("PaymentMethod", sql.NVarChar(50), paymentMethod || null)
    .input("PaymentId", sql.NVarChar(255), paymentId || null)
    .query(`
      INSERT INTO AdPurchases
        (PurchaseId, UserAdId, PackageId, BarPageId, AccountId, PackageName, PackageCode, 
         Impressions, Price, PaymentHistoryId, PaymentMethod, PaymentId, 
         PaymentStatus, Status, UsedImpressions, PurchasedAt)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @UserAdId, @PackageId, @BarPageId, @AccountId, @PackageName, @PackageCode,
         @Impressions, @Price, @PaymentHistoryId, @PaymentMethod, @PaymentId,
         'pending', 'pending', 0, GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Tìm purchase theo ID
 */
async function findById(purchaseId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PurchaseId", sql.UniqueIdentifier, purchaseId)
    .query("SELECT TOP 1 * FROM AdPurchases WHERE PurchaseId = @PurchaseId");
  return result.recordset[0] || null;
}

/**
 * Lấy purchases của một ad
 */
async function getPurchasesByUserAdId(userAdId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("UserAdId", sql.UniqueIdentifier, userAdId)
    .query(`
      SELECT *
      FROM AdPurchases
      WHERE UserAdId = @UserAdId
      ORDER BY PurchasedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy purchases của một BarPage
 */
async function getPurchasesByBarPageId(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT *
      FROM AdPurchases
      WHERE BarPageId = @BarPageId
      ORDER BY PurchasedAt DESC
    `);
  return result.recordset;
}

/**
 * Lấy purchases của một Account
 */
async function getPurchasesByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      SELECT *
      FROM AdPurchases
      WHERE AccountId = @AccountId
      ORDER BY PurchasedAt DESC
    `);
  return result.recordset;
}

/**
 * Update purchase status và payment status
 */
async function updatePurchaseStatus(purchaseId, status, paymentStatus = null) {
  const pool = await getPool();
  const request = pool.request()
    .input("PurchaseId", sql.UniqueIdentifier, purchaseId)
    .input("Status", sql.NVarChar(50), status);
  
  let updates = ["Status = @Status"];
  
  if (paymentStatus) {
    request.input("PaymentStatus", sql.NVarChar(50), paymentStatus);
    updates.push("PaymentStatus = @PaymentStatus");
  }
  
  if (status === 'active' && paymentStatus === 'paid') {
    updates.push("ActivatedAt = GETDATE()");
  }
  
  if (status === 'completed') {
    updates.push("CompletedAt = GETDATE()");
  }
  
  if (status === 'cancelled') {
    updates.push("CancelledAt = GETDATE()");
  }
  
  const result = await request.query(`
    UPDATE AdPurchases
    SET ${updates.join(", ")}
    OUTPUT inserted.*
    WHERE PurchaseId = @PurchaseId
  `);
  
  return result.recordset[0] || null;
}

/**
 * Update used impressions của purchase
 */
async function updateUsedImpressions(purchaseId, usedImpressions) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PurchaseId", sql.UniqueIdentifier, purchaseId)
    .input("UsedImpressions", sql.Int, usedImpressions)
    .query(`
      UPDATE AdPurchases
      SET UsedImpressions = @UsedImpressions
      OUTPUT inserted.*
      WHERE PurchaseId = @PurchaseId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy purchases theo PaymentHistoryId
 */
async function getPurchaseByPaymentHistoryId(paymentHistoryId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PaymentHistoryId", sql.UniqueIdentifier, paymentHistoryId)
    .query(`
      SELECT TOP 1 *
      FROM AdPurchases
      WHERE PaymentHistoryId = @PaymentHistoryId
    `);
  return result.recordset[0] || null;
}

/**
 * Lấy tất cả purchases với filter (cho admin dashboard)
 */
async function getAllPurchases({ 
  status, 
  paymentStatus, 
  packageId, 
  barPageId, 
  limit = 50, 
  offset = 0 
} = {}) {
  const pool = await getPool();
  const request = pool.request()
    .input("Limit", sql.Int, limit)
    .input("Offset", sql.Int, offset);
  
  let whereConditions = [];
  
  if (status) {
    request.input("Status", sql.NVarChar(50), status);
    whereConditions.push("ap.Status = @Status");
  }
  
  if (paymentStatus) {
    request.input("PaymentStatus", sql.NVarChar(50), paymentStatus);
    whereConditions.push("ap.PaymentStatus = @PaymentStatus");
  }
  
  if (packageId) {
    request.input("PackageId", sql.UniqueIdentifier, packageId);
    whereConditions.push("ap.PackageId = @PackageId");
  }
  
  if (barPageId) {
    request.input("BarPageId", sql.UniqueIdentifier, barPageId);
    whereConditions.push("ap.BarPageId = @BarPageId");
  }
  
  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";
  
  const result = await request.query(`
    SELECT 
      ap.*,
      ua.Title AS AdTitle,
      bp.BarName
    FROM AdPurchases ap
    LEFT JOIN UserAdvertisements ua ON ap.UserAdId = ua.UserAdId
    LEFT JOIN BarPages bp ON ap.BarPageId = bp.BarPageId
    ${whereClause}
    ORDER BY ap.PurchasedAt DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY
  `);
  
  return result.recordset;
}

/**
 * Lấy thống kê purchases theo package (cho admin dashboard)
 */
async function getPurchaseStatsByPackage(packageId = null) {
  const pool = await getPool();
  const request = pool.request();
  
  let whereClause = "";
  if (packageId) {
    request.input("PackageId", sql.UniqueIdentifier, packageId);
    whereClause = "WHERE ap.PackageId = @PackageId";
  }
  
  const result = await request.query(`
    SELECT 
      ap.PackageId,
      ap.PackageName,
      COUNT(*) AS TotalPurchases,
      SUM(CASE WHEN ap.PaymentStatus = 'paid' THEN 1 ELSE 0 END) AS PaidPurchases,
      SUM(CASE WHEN ap.Status = 'active' THEN 1 ELSE 0 END) AS ActivePurchases,
      SUM(CASE WHEN ap.PaymentStatus = 'paid' THEN ap.Price ELSE 0 END) AS TotalRevenue,
      SUM(ap.Impressions) AS TotalImpressionsSold,
      SUM(ap.UsedImpressions) AS TotalImpressionsUsed
    FROM AdPurchases ap
    ${whereClause}
    GROUP BY ap.PackageId, ap.PackageName
    ORDER BY TotalRevenue DESC
  `);
  
  return result.recordset;
}

module.exports = {
  createPurchase,
  findById,
  getPurchasesByUserAdId,
  getPurchasesByBarPageId,
  getPurchasesByAccountId,
  updatePurchaseStatus,
  updateUsedImpressions,
  getPurchaseByPaymentHistoryId,
  getAllPurchases,
  getPurchaseStatsByPackage
};


