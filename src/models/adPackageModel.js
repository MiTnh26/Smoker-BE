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
 * Tính toán SoldCount và TotalRevenue từ AdPurchases thực tế
 */
async function getAllPackages() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT 
      ap.PackageId,
      ap.PackageName,
      ap.PackageCode,
      ap.Impressions,
      ap.Price,
      ap.Description,
      ap.IsActive,
      ap.DisplayOrder,
      ap.OriginalPrice,
      ap.CreatedAt,
      ap.UpdatedAt,
      -- Tính SoldCount từ AdPurchases với PaymentStatus = 'paid'
      CAST(ISNULL((
        SELECT COUNT(*)
        FROM AdPurchases
        WHERE PackageId = ap.PackageId
          AND PaymentStatus = 'paid'
      ), 0) AS INT) AS SoldCount,
      -- Tính TotalRevenue từ AdPurchases với PaymentStatus = 'paid'
      CAST(ISNULL((
        SELECT SUM(Price)
        FROM AdPurchases
        WHERE PackageId = ap.PackageId
          AND PaymentStatus = 'paid'
      ), 0) AS DECIMAL(18,2)) AS TotalRevenue
    FROM AdPackages ap
    ORDER BY ap.DisplayOrder ASC, ap.CreatedAt DESC
  `);
  
  // Đảm bảo các giá trị số được convert đúng
  return result.recordset.map(pkg => ({
    ...pkg,
    SoldCount: pkg.SoldCount != null ? parseInt(pkg.SoldCount) : 0,
    TotalRevenue: pkg.TotalRevenue != null ? parseFloat(pkg.TotalRevenue) : 0
  }));
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
  
  // Insert không dùng OUTPUT clause (vì có trigger)
  await pool.request()
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
      VALUES
        (NEWID(), @PackageName, @PackageCode, @Impressions, @Price, @Description,
         @IsActive, @DisplayOrder, @OriginalPrice, 0, 0, GETDATE(), GETDATE())
    `);
  
  // Query lại bằng PackageCode (unique) để lấy record vừa tạo
  return await findByCode(packageCode);
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
  
  await request.query(`
    UPDATE AdPackages
    SET ${updates.join(", ")}
    WHERE PackageId = @PackageId
  `);
  
  // Query lại để lấy record đã update
  return await findById(packageId);
}

/**
 * Xóa gói quảng cáo (soft delete - set IsActive = 0)
 */
async function deletePackage(packageId) {
  const pool = await getPool();
  await pool.request()
    .input("PackageId", sql.UniqueIdentifier, packageId)
    .query(`
      UPDATE AdPackages
      SET IsActive = 0, UpdatedAt = GETDATE()
      WHERE PackageId = @PackageId
    `);
  
  // Query lại để lấy record đã update
  return await findById(packageId);
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
    await pool.request()
      .input("PackageId", sql.UniqueIdentifier, packageId)
      .input("Price", sql.Decimal(18,2), price)
      .query(`
        UPDATE AdPackages
        SET 
          SoldCount = SoldCount + 1,
          TotalRevenue = TotalRevenue + @Price,
          UpdatedAt = GETDATE()
        WHERE PackageId = @PackageId
      `);
  } else if (action === 'decrement') {
    await pool.request()
      .input("PackageId", sql.UniqueIdentifier, packageId)
      .input("Price", sql.Decimal(18,2), price)
      .query(`
        UPDATE AdPackages
        SET 
          SoldCount = CASE WHEN SoldCount > 0 THEN SoldCount - 1 ELSE 0 END,
          TotalRevenue = CASE WHEN TotalRevenue >= @Price THEN TotalRevenue - @Price ELSE 0 END,
          UpdatedAt = GETDATE()
        WHERE PackageId = @PackageId
      `);
  } else {
    throw new Error("Invalid action. Must be 'increment' or 'decrement'");
  }
  
  // Query lại để lấy record đã update (optional - chỉ cần nếu cần return data)
  return await findById(packageId);
}

/**
 * Lấy thống kê tổng quan cho admin dashboard
 * Tính toán từ dữ liệu thực tế trong AdPurchases
 */
async function getPackageStats() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT 
      -- Tổng số gói
      (SELECT COUNT(*) FROM AdPackages) AS TotalPackages,
      -- Số gói đang hoạt động
      (SELECT COUNT(*) FROM AdPackages WHERE IsActive = 1) AS ActivePackages,
      -- Tổng số gói đã bán (từ AdPurchases với PaymentStatus = 'paid')
      (SELECT COUNT(*) FROM AdPurchases WHERE PaymentStatus = 'paid') AS TotalSoldCount,
      -- Tổng doanh thu (từ AdPurchases với PaymentStatus = 'paid')
      ISNULL((SELECT SUM(Price) FROM AdPurchases WHERE PaymentStatus = 'paid'), 0) AS OverallRevenue
    FROM AdPackages
    -- Chỉ cần 1 row
    WHERE 1=1
  `);
  
  const stats = result.recordset[0] || {
    TotalPackages: 0,
    ActivePackages: 0,
    TotalSoldCount: 0,
    OverallRevenue: 0
  };
  
  // Đảm bảo tên field đúng với frontend
  return {
    TotalPackages: stats.TotalPackages || 0,
    ActivePackages: stats.ActivePackages || 0,
    TotalSoldCount: stats.TotalSoldCount || 0,
    OverallRevenue: stats.OverallRevenue || 0
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


