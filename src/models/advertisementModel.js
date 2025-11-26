const { getPool, sql } = require("../db/sqlserver");


async function getActiveStaticAds(limit = 20) {
  const pool = await getPool();
  const result = await pool.request()
    .input("Limit", sql.Int, limit)
    .query(`
      SELECT TOP (@Limit) *
      FROM Advertisements
      WHERE AdType = 'static' AND IsActive = 1
      ORDER BY DisplayOrder ASC, UpdatedAt DESC
    `);
  return result.recordset;
}

async function findById(advertisementId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AdvertisementId", sql.UniqueIdentifier, advertisementId)
    .query("SELECT TOP 1 * FROM Advertisements WHERE AdvertisementId = @AdvertisementId");
  return result.recordset[0] || null;
}

/**
 * Tạo test ad cho testing
 */
async function createTestAd({ adType = "static", title, imageUrl, redirectUrl, displayOrder = 0 }) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AdType", sql.NVarChar(50), adType)
    .input("Title", sql.NVarChar(255), title || `Test Ad ${Date.now()}`)
    .input("ImageUrl", sql.NVarChar(sql.MAX), imageUrl || "https://via.placeholder.com/300x250?text=Test+Ad")
    .input("VideoUrl", sql.NVarChar(sql.MAX), null)
    .input("RedirectUrl", sql.NVarChar(sql.MAX), redirectUrl || "https://example.com")
    .input("DisplayOrder", sql.Int, displayOrder)
    .query(`
      INSERT INTO Advertisements
        (AdvertisementId, AdType, Title, ImageUrl, VideoUrl, RedirectUrl, DisplayOrder, IsActive, CreatedAt, UpdatedAt)
      OUTPUT inserted.*
      VALUES
        (NEWID(), @AdType, @Title, @ImageUrl, @VideoUrl, @RedirectUrl, @DisplayOrder, 1, GETDATE(), GETDATE());
    `);
  
  return result.recordset[0];
}

/**
 * Tạo nhiều test ads
 */
async function createTestAds(count = 3) {
  const ads = [];
  for (let i = 0; i < count; i++) {
    const ad = await createTestAd({
      adType: "static",
      title: `Test Ad ${i + 1} - ${new Date().toLocaleString('vi-VN')}`,
      imageUrl: `https://via.placeholder.com/300x250?text=Test+Ad+${i + 1}`,
      redirectUrl: `https://example.com/ad-${i + 1}`,
      displayOrder: i
    });
    ads.push(ad);
  }
  return ads;
}

module.exports = {
  getActiveStaticAds,
  findById,
  createTestAd,
  createTestAds
};