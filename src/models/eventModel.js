const sql = require("mssql");
const { getPool } = require("../db/sqlserver");

// 🧱 Tạo mới sự kiện
async function createEvent({ BarPageId, EventName, Description, Picture, StartTime, EndTime }) {
  const pool = await getPool();

  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, BarPageId)
    .input("EventName", sql.NVarChar(255), EventName)
    .input("Description", sql.NVarChar(sql.MAX), Description || "")
    .input("Picture", sql.NVarChar(500), Picture || "")
    .input("StartTime", sql.DateTime, StartTime)
    .input("EndTime", sql.DateTime, EndTime)
    .query(`
      INSERT INTO Events (BarPageId, EventName, Description, Picture, StartTime, EndTime, CreatedAt)
      OUTPUT INSERTED.*
      VALUES (@BarPageId, @EventName, @Description, @Picture, @StartTime, @EndTime, GETDATE())
    `);

  return result.recordset[0];
}

// 🧾 Lấy danh sách sự kiện theo BarPageId
async function getEventsByBarId(barPageId) {
  const pool = await getPool();

  const result = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`
      SELECT EventId, BarPageId, EventName, Description, Picture, StartTime, EndTime, CreatedAt
      FROM Events
      WHERE BarPageId = @BarPageId
      ORDER BY CreatedAt DESC
    `);

  return result.recordset;
}

// ❌ Xóa sự kiện
async function deleteEvent(eventId) {
  const pool = await getPool();

  await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .query(`
      DELETE FROM Events WHERE EventId = @EventId
    `);
}

// ✏️ Cập nhật sự kiện
async function updateEvent(eventId, data) {
  const pool = await getPool();

  const { EventName, Description, Picture, StartTime, EndTime } = data;

  const result = await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .input("EventName", sql.NVarChar(255), EventName)
    .input("Description", sql.NVarChar(sql.MAX), Description || "")
    .input("Picture", sql.NVarChar(500), Picture || "")
    .input("StartTime", sql.DateTime, StartTime)
    .input("EndTime", sql.DateTime, EndTime)
    .query(`
      UPDATE Events
      SET 
        EventName = @EventName,
        Description = @Description,
        Picture = @Picture,
        StartTime = @StartTime,
        EndTime = @EndTime,
        UpdatedAt = GETDATE()
      OUTPUT INSERTED.*
      WHERE EventId = @EventId
    `);

  return result.recordset[0];
}

module.exports = {
  createEvent,
  getEventsByBarId,
  deleteEvent,
  updateEvent,
};
