const sql = require("mssql");
const { getPool } = require("../db/sqlserver");

// Cache for uuid module (ES Module, so we use dynamic import)
let uuidModule = null;
async function getUuidModule() {
  if (!uuidModule) {
    uuidModule = await import("uuid");
  }
  return uuidModule;
// Simple UUID (RFC 4122) validator to avoid ESM-only `uuid` package issues
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

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
      SELECT EventId, BarPageId, EventName, Description, Picture, StartTime, EndTime, Status, CreatedAt, UpdatedAt
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
  if (!isValidUUID(eventId)) {
    return null; // Không throw, để controller xử lý 404
  }

  const pool = await getPool();

  const result = await pool.request()
    .input("EventId", sql.UniqueIdentifier, eventId)
    .query(`
      SELECT 
        e.EventId,
        e.BarPageId,
        e.EventName,
        e.Description,
        e.Picture AS EventPicture,
        e.StartTime,
        e.EndTime,
        e.Status,
        e.CreatedAt,
        e.UpdatedAt,
        b.BarName,
        b.Avatar AS BarAvatar,
        b.Background AS BarBackground,
        b.Address AS BarAddress,
        b.PhoneNumber AS BarPhone,
        b.Email AS BarEmail,
        b.Role AS BarRole,
        b.created_at AS BarCreatedAt

      FROM dbo.Events e
      LEFT JOIN dbo.BarPages b ON e.BarPageId = b.BarPageId
      WHERE e.EventId = @EventId
    `);

  return result.recordset[0] || null;
}

// src/models/eventModel.js
// src/models/eventModel.js → updateEvent

async function updateEvent(eventId, data) {
  const pool = await getPool();

  const fields = [];
  const inputs = { EventId: eventId };

  if (data.EventName !== undefined) {
    fields.push("EventName = @EventName");
    inputs.EventName = data.EventName;
  }
  if (data.Description !== undefined) {
    fields.push("Description = @Description");
    inputs.Description = data.Description || "";
  }
  if (data.Picture !== undefined) {
    fields.push("Picture = @Picture");        // ← có thể là URL hoặc ""
    inputs.Picture = data.Picture;
    console.log("📸 Model: Setting Picture =", data.Picture);
    console.log("📸 Model: Picture type:", typeof data.Picture);
    console.log("📸 Model: Picture length:", data.Picture ? data.Picture.length : 0);
  } else {
    console.log("ℹ️ Model: Picture not in data - skipping update");
  }
  if (data.StartTime) {
    fields.push("StartTime = @StartTime");
    inputs.StartTime = data.StartTime;
  }
  if (data.EndTime) {
    fields.push("EndTime = @EndTime");
    inputs.EndTime = data.EndTime;
  }
  if (data.Status !== undefined) {
    fields.push("Status = @Status");
    inputs.Status = data.Status;
  }

  if (fields.length === 0) return null;

  fields.push("UpdatedAt = SYSUTCDATETIME()");

  const query = `
    UPDATE dbo.Events
    SET ${fields.join(", ")}
    OUTPUT INSERTED.*
    WHERE EventId = @EventId
  `;

  const request = pool.request();
  Object.keys(inputs).forEach(key => request.input(key, inputs[key]));

  console.log("📋 Model: SQL Query:", query);
  console.log("📋 Model: Inputs:", Object.keys(inputs));
  console.log("📋 Model: Picture input:", inputs.Picture ? `${inputs.Picture.substring(0, 50)}...` : "null/empty");
  
  const rs = await request.query(query);
  const result = rs.recordset[0] || null;
  
  if (result) {
    console.log("✅ Model: Update successful - Picture:", result.Picture ? `${result.Picture.substring(0, 50)}...` : "null/empty");
  } else {
    console.warn("⚠️ Model: Update returned no result");
  }
  
  return result;
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
async function getAllEvents({ skip = 0, take = 20, status = null } = {}) {
  const pool = await getPool();

  let query = `
    SELECT e.EventId, e.BarPageId, e.EventName, e.Description, e.Picture,
           e.StartTime, e.EndTime, e.Status, e.CreatedAt, e.UpdatedAt,
           b.BarName
    FROM dbo.Events e
    LEFT JOIN dbo.BarPages b ON e.BarPageId = b.BarPageId
  `;

  let countQuery = `
    SELECT COUNT(1) as Total
    FROM dbo.Events e
  `;

  const request = pool.request();
  const countRequest = pool.request();

  if (status) {
    query += ` WHERE e.Status = @Status`;
    countQuery += ` WHERE e.Status = @Status`;
    request.input("Status", sql.NVarChar(50), status);
    countRequest.input("Status", sql.NVarChar(50), status);
  }

  query += ` ORDER BY e.StartTime DESC OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY`;

  request.input("Skip", sql.Int, skip);
  request.input("Take", sql.Int, take);

  const countRs = await countRequest.query(countQuery);
  const listRs = await request.query(query);

  return {
    total: countRs.recordset[0].Total,
    items: listRs.recordset
  };
}

async function searchEvents({ q, skip = 0, take = 20 }) {
  if (!q || q.trim().length < 2) {
    return { total: 0, items: [] };
  }

  const searchTerm = `%${q.trim()}%`;
  const pool = await getPool();

  const countRs = await pool.request()
    .input("SearchTerm", sql.NVarChar(255), searchTerm)
    .query(`
      SELECT COUNT(1) as Total
      FROM dbo.Events e
      LEFT JOIN dbo.BarPages b ON e.BarPageId = b.BarPageId
      WHERE e.EventName LIKE @SearchTerm
         OR b.BarName LIKE @SearchTerm
    `);

  const listRs = await pool.request()
    .input("SearchTerm", sql.NVarChar(255), searchTerm)
    .input("Skip", sql.Int, skip)
    .input("Take", sql.Int, take)
    .query(`
      SELECT e.EventId, e.EventName, e.Picture, e.StartTime, e.EndTime, e.Status,
             b.BarName, b.Avatar as BarAvatar
      FROM dbo.Events e
      LEFT JOIN dbo.BarPages b ON e.BarPageId = b.BarPageId
      WHERE e.EventName LIKE @SearchTerm
         OR b.BarName LIKE @SearchTerm
      ORDER BY 
        CASE 
          WHEN e.EventName LIKE @SearchTerm THEN 0
          WHEN b.BarName LIKE @SearchTerm THEN 1
          ELSE 2 
        END,
        e.StartTime DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY
    `);

  return {
    total: countRs.recordset[0].Total,
    items: listRs.recordset
  };
}

// Tự động cập nhật status các event đã hết hạn
async function autoUpdateEndedEvents() {
  const pool = await getPool();
  await pool.request()
    .query(`
      UPDATE dbo.Events
      SET Status = 'ended',
          UpdatedAt = SYSUTCDATETIME()
      WHERE EndTime < SYSUTCDATETIME()
        AND Status != 'ended'
    `);
}

module.exports = {
  createEvent,
  getEventsByBarId,
  getEventById,
  updateEvent,
  deleteEvent,
  updateEventStatus,
   getAllEvents,        // THÊM DÒNG NÀY
  searchEvents,        // THÊM DÒNG NÀY
  autoUpdateEndedEvents // THÊM DÒNG NÀY
};
