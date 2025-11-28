const { getPool, sql } = require("../db/sqlserver");

async function getRotation(barPageId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query("SELECT TOP 1 * FROM StaticAdRotation WHERE BarPageId = @BarPageId");
  return result.recordset[0] || null;
}

async function saveRotation({ barPageId, advertisementId, nextIndex }) {
  const pool = await getPool();
  await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("AdvertisementId", sql.UniqueIdentifier, advertisementId)
    .input("NextIndex", sql.Int, nextIndex)
    .query(`
      MERGE StaticAdRotation AS target
      USING (SELECT @BarPageId AS BarPageId) AS source
      ON target.BarPageId = source.BarPageId
      WHEN MATCHED THEN UPDATE SET
        AdvertisementId = @AdvertisementId,
        CurrentRotationIndex = @NextIndex,
        DisplayCount = DisplayCount + 1,
        LastDisplayedAt = GETDATE()
      WHEN NOT MATCHED THEN INSERT
        (RotationId, BarPageId, AdvertisementId, CurrentRotationIndex, DisplayCount, LastDisplayedAt, CreatedAt)
        VALUES
        (NEWID(), @BarPageId, @AdvertisementId, @NextIndex, 1, GETDATE(), GETDATE());
    `);
}

module.exports = {
  getRotation,
  saveRotation
};