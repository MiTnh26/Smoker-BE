const sql = require("mssql");
const { getPool } = require("../db/sqlserver");
const { validate: uuidValidate } = require("uuid");

async function createEvent({ BarPageId, EventName, Description, Picture, StartTime, EndTime, Status }) {
  const pool = await getPool();

  const res = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, BarPageId)
    .input("EventName", sql.NVarChar(255), EventName)
    .input("Description", sql.NVarChar(sql.MAX), Description || "")
    .input("Picture", sql.NVarChar(500), Picture || "")
    .input("StartTime", sql.DateTime2, StartTime)
    .input("EndTime", sql.DateTime2, EndTime)
    .input("Status", sql.NVarChar(50), Status || "visible")   // << THÊM DÒNG NÀY
    .query(`
      INSERT INTO dbo.Events (
        BarPageId, EventName, Description, Picture, StartTime, EndTime, Status
      )
      OUTPUT INSERTED.EventId, INSERTED.BarPageId, INSERTED.EventName,
             INSERTED.Description, INSERTED.Picture, INSERTED.StartTime,
             INSERTED.EndTime, INSERTED.Status, INSERTED.CreatedAt, INSERTED.UpdatedAt
      VALUES (
        @BarPageId, @EventName, @Description, @Picture, @StartTime, @EndTime, @Status
      )
    `);

  return res.recordset[0];
}


async function getEventsByBarId(barPageId, { skip = 0, take = 20 } = {}) {
  const pool = await getPool();

  // Dùng native query để tránh phụ thuộc SP
  const countRs = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .query(`SELECT COUNT(1) as Total FROM dbo.Events WHERE BarPageId = @BarPageId`);

  const listRs = await pool.request()
    .input("BarPageId", sql.UniqueIdentifier, barPageId)
    .input("Skip", sql.Int, skip)
    .input("Take", sql.Int, take)
    .query(`
      SELECT EventId, BarPageId, EventName, Description, Picture, StartTime, EndTime, CreatedAt, UpdatedAt
      FROM dbo.Events
      WHERE BarPageId = @BarPageId
      ORDER BY CreatedAt DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    `);

  return {
    total: countRs.recordset[0].Total,
    items: listRs.recordset
  };
}

async function getEventById(eventId) {
  // BƯỚC 1: Validate UUID
  if (!eventId || !uuidValidate(eventId)) {
    return null; // Không throw, để controller xử lý 404
  }

  const pool = await getPool();
  const result = await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .query(`
      SELECT TOP 1 
        EventId, BarPageId, EventName, Description, Picture,
        StartTime, EndTime, Status, CreatedAt, UpdatedAt
      FROM dbo.Events
      WHERE EventId = @EventId
    `);

  return result.recordset[0] || null;
}

async function updateEvent(eventId, data) {
  const pool = await getPool();
  const { EventName, Description, Picture, StartTime, EndTime } = data;

  const rs = await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .input("EventName", sql.NVarChar(255), EventName)
    .input("Description", sql.NVarChar(sql.MAX), Description || "")
    .input("Picture", sql.NVarChar(500), Picture || "")
    .input("StartTime", sql.DateTime2, StartTime)
    .input("EndTime", sql.DateTime2, EndTime)
    .query(`
      UPDATE dbo.Events
      SET EventName = @EventName,
          Description = @Description,
          Picture = @Picture,
          StartTime = @StartTime,
          EndTime = @EndTime,
          UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.EventId, INSERTED.BarPageId, INSERTED.EventName, INSERTED.Description,
             INSERTED.Picture, INSERTED.StartTime, INSERTED.EndTime, INSERTED.CreatedAt, INSERTED.UpdatedAt
      WHERE EventId = @EventId
    `);

  return rs.recordset[0] || null;
}

async function deleteEvent(eventId) {
  const pool = await getPool();
  await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .query(`DELETE FROM dbo.Events WHERE EventId = @EventId`);
}
async function updateEventStatus(eventId, newStatus) {
  const pool = await getPool();

  const res = await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .input("Status", sql.NVarChar(50), newStatus)
    .query(`
      UPDATE dbo.Events
      SET Status = @Status,
          UpdatedAt = SYSUTCDATETIME()
      WHERE EventId = @EventId;

      SELECT * FROM dbo.Events WHERE EventId = @EventId;
    `);

  return res.recordset[0];
}


module.exports = {
  createEvent,
  getEventsByBarId,
  getEventById,
  updateEvent,
  deleteEvent,
  updateEventStatus
};
