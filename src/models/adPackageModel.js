const { getPool, sql } = require("../db/sqlserver");

/**
 * Lấy tất cả gói quảng cáo active
 */
async function getAllActivePackages() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT *
    FROM AdPackages
    WHERE IsActive = 1
    ORDER BY DisplayOrder ASC, Price ASC
  `);
  return result.recordset;
}

/**
 * Lấy tất cả gói quảng cáo (bao gồm cả inactive - cho admin)
 */
async function getAllPackages() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT *
    FROM AdPackages
    ORDER BY DisplayOrder ASC, CreatedAt DESC
  `);
  return result.recordset;
}

/**
 * Lấy gói theo PackageId
 */
async function findById(packageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PackageId", sql.UniqueIdentifier, packageId)
    .query("SELECT TOP 1 * FROM AdPackages WHERE PackageId = @PackageId");
  return result.recordset[0] || null;
}

/**
 * Lấy gói theo PackageCode
 */
async function findByCode(packageCode) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PackageCode", sql.NVarChar(100), packageCode)
    .query("SELECT TOP 1 * FROM AdPackages WHERE PackageCode = @PackageCode");
  return result.recordset[0] || null;
}

/**
 * Tạo gói quảng cáo mới (Admin)
 */
async function createPackage({
  packageName,
  packageCode,
  impressions,
  price,
  description = null,
  isActive = true,
  displayOrder = 0,
  originalPrice = null
}) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PackageName", sql.NVarChar(255), packageName)
    .input("PackageCode", sql.NVarChar(100), packageCode)
    .input("Impressions", sql.Int, impressions)
    .input("Price", sql.Decimal(18,2), price)
    .input("Description", sql.NVarChar(sql.MAX), description)
    .input("IsActive", sql.Bit, isActive ? 1 : 0)
    .input("DisplayOrder", sql.Int, displayOrder)
    .input("OriginalPrice", sql.Decimal(18,2), originalPrice)
    .query(`
      INSERT INTO AdPackages
        (PackageId, PackageName, PackageCode, Impressions, Price, Description, 
         IsActive, DisplayOrder, OriginalPrice, SoldCount, TotalRevenue, CreatedAt, UpdatedAt)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @PackageName, @PackageCode, @Impressions, @Price, @Description,
         @IsActive, @DisplayOrder, @OriginalPrice, 0, 0, GETDATE(), GETDATE())
    `);
  return result.recordset[0];
}

/**
 * Cập nhật gói quảng cáo (Admin)
 */
async function updatePackage(packageId, {
  packageName,
  packageCode,
  impressions,
  price,
  description,
  isActive,
  displayOrder,
  originalPrice
}) {
  const pool = await getPool();
  const request = pool.request()
    .input("PackageId", sql.UniqueIdentifier, packageId);
  
  const updates = [];
  
  if (packageName !== undefined) {
    request.input("PackageName", sql.NVarChar(255), packageName);
    updates.push("PackageName = @PackageName");
  }
  if (packageCode !== undefined) {
    request.input("PackageCode", sql.NVarChar(100), packageCode);
    updates.push("PackageCode = @PackageCode");
  }
  if (impressions !== undefined) {
    request.input("Impressions", sql.Int, impressions);
    updates.push("Impressions = @Impressions");
  }
  if (price !== undefined) {
    request.input("Price", sql.Decimal(18,2), price);
    updates.push("Price = @Price");
  }
  if (description !== undefined) {
    request.input("Description", sql.NVarChar(sql.MAX), description);
    updates.push("Description = @Description");
  }
  if (isActive !== undefined) {
    request.input("IsActive", sql.Bit, isActive ? 1 : 0);
    updates.push("IsActive = @IsActive");
  }
  if (displayOrder !== undefined) {
    request.input("DisplayOrder", sql.Int, displayOrder);
    updates.push("DisplayOrder = @DisplayOrder");
  }
  if (originalPrice !== undefined) {
    request.input("OriginalPrice", sql.Decimal(18,2), originalPrice);
    updates.push("OriginalPrice = @OriginalPrice");
  }
  
  if (updates.length === 0) {
    throw new Error("No fields to update");
  }
  
  updates.push("UpdatedAt = GETDATE()");
  
  const result = await request.query(`
    UPDATE AdPackages
    SET ${updates.join(", ")}
    OUTPUT inserted.*
    WHERE PackageId = @PackageId
  `);
  
  return result.recordset[0] || null;
}

/**
 * Xóa gói quảng cáo (soft delete - set IsActive = 0)
 */
async function deletePackage(packageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("PackageId", sql.UniqueIdentifier, packageId)
    .query(`
      UPDATE AdPackages
      SET IsActive = 0, UpdatedAt = GETDATE()
      OUTPUT inserted.*
      WHERE PackageId = @PackageId
    `);
  return result.recordset[0] || null;
}

/**
 * Cập nhật thống kê bán hàng (SoldCount và TotalRevenue)
 * @param {string} packageId - PackageId
 * @param {number} price - Giá của purchase
 * @param {string} action - 'increment' hoặc 'decrement'
 */
async function updatePackageStats(packageId, price, action = 'increment') {
  const pool = await getPool();
  
  if (action === 'increment') {
    const result = await pool.request()
      .input("PackageId", sql.UniqueIdentifier, packageId)
      .input("Price", sql.Decimal(18,2), price)
      .query(`
        UPDATE AdPackages
        SET 
          SoldCount = SoldCount + 1,
          TotalRevenue = TotalRevenue + @Price,
          UpdatedAt = GETDATE()
        OUTPUT inserted.*
        WHERE PackageId = @PackageId
      `);
    return result.recordset[0] || null;
  } else if (action === 'decrement') {
    const result = await pool.request()
      .input("PackageId", sql.UniqueIdentifier, packageId)
      .input("Price", sql.Decimal(18,2), price)
      .query(`
        UPDATE AdPackages
        SET 
          SoldCount = CASE WHEN SoldCount > 0 THEN SoldCount - 1 ELSE 0 END,
          TotalRevenue = CASE WHEN TotalRevenue >= @Price THEN TotalRevenue - @Price ELSE 0 END,
          UpdatedAt = GETDATE()
        OUTPUT inserted.*
        WHERE PackageId = @PackageId
      `);
    return result.recordset[0] || null;
  } else {
    throw new Error("Invalid action. Must be 'increment' or 'decrement'");
  }
}

/**
 * Lấy thống kê tổng quan cho admin dashboard
 */
async function getPackageStats() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT 
      COUNT(*) AS TotalPackages,
      SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActivePackages,
      SUM(SoldCount) AS TotalSold,
      SUM(TotalRevenue) AS TotalRevenue
    FROM AdPackages
  `);
  return result.recordset[0] || {
    TotalPackages: 0,
    ActivePackages: 0,
    TotalSold: 0,
    TotalRevenue: 0
  };
}

module.exports = {
  getAllActivePackages,
  getAllPackages,
  findById,
  findByCode,
  createPackage,
  updatePackage,
  deletePackage,
  updatePackageStats,
  getPackageStats
};


