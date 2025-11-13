const { getPool } = require("../db/sqlserver");
const sql = require("mssql");
const { success, error: errorResp } = require("../utils/response") || {
  success: (res, data, message) => res.status(200).json({ success: true, data, message }),
  error: (res, message, code = 500) => res.status(code).json({ success: false, message })
};

class BookingController {
  // POST /booking/request
  async createRequest(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const {
        requesterEntityAccountId,
        requesterRole, // "Bar" | "Customer"
        performerEntityAccountId,
        performerRole, // "DJ" | "DANCER"
        date, // yyyy-mm-dd (optional if using start/end)
        startTime, // ISO string
        endTime, // ISO string
        location,
        note,
        offeredPrice
      } = req.body || {};

      if (!requesterEntityAccountId || !performerEntityAccountId) {
        return res.status(400).json({ success: false, message: "Missing requester/performer" });
      }
      if (String(requesterEntityAccountId).toLowerCase().trim() === String(performerEntityAccountId).toLowerCase().trim()) {
        return res.status(400).json({ success: false, message: "Cannot book yourself" });
      }

      const pool = await getPool();
      // Insert BookedSchedules
      const result = await pool.request()
        .input("BookerId", sql.UniqueIdentifier, requesterEntityAccountId)
        .input("ReceiverId", sql.UniqueIdentifier, performerEntityAccountId)
        .input("Type", sql.NVarChar, "Personal booking")
        .input("TotalAmount", sql.Int, offeredPrice || 0)
        .input("PaymentStatus", sql.NVarChar, "Pending")
        .input("ScheduleStatus", sql.NVarChar, "Upcoming")
        .input("BookingDate", sql.DateTime, date ? new Date(date) : new Date(startTime || Date.now()))
        .input("StartTime", sql.DateTime, startTime ? new Date(startTime) : new Date())
        .input("EndTime", sql.DateTime, endTime ? new Date(endTime) : new Date())
        .input("MongoDetailId", sql.NVarChar, note || null)
        .query(`
          INSERT INTO BookedSchedules
          (BookerId, ReceiverId, Type, TotalAmount, PaymentStatus, ScheduleStatus, BookingDate, StartTime, EndTime, MongoDetailId)
          OUTPUT inserted.BookedScheduleId
          VALUES (@BookerId, @ReceiverId, @Type, @TotalAmount, @PaymentStatus, @ScheduleStatus, @BookingDate, @StartTime, @EndTime, @MongoDetailId)
        `);

      const bookingId = result.recordset?.[0]?.BookedScheduleId;
      return res.status(201).json({ success: true, data: { id: bookingId }, message: "Booking created" });
    } catch (e) {
      console.error("[Booking] createRequest error:", e);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // GET /booking/my?as=requester|performer&status=...
  async getMyBookings(req, res) {
    try {
      const accountId = req.user?.id;
      if (!accountId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const as = (req.query?.as || "requester").toLowerCase(); // requester | performer
      const status = req.query?.status;
      const entityAccountId = req.query?.entityAccountId;
      if (!entityAccountId) {
        return res.status(400).json({ success: false, message: "Missing entityAccountId" });
      }
      const pool = await getPool();
      const col = as === "performer" ? "ReceiverId" : "BookerId";

      let query = `
        SELECT * FROM BookedSchedules
        WHERE ${col} = @EntityAccountId
      `;
      if (status) {
        query += ` AND ScheduleStatus = @Status`;
      }
      query += ` ORDER BY created_at DESC`;

      const request = pool.request()
        .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId);
      if (status) request.input("Status", sql.NVarChar, status);

      const rs = await request.query(query);
      return res.status(200).json({ success: true, data: rs.recordset || [] });
    } catch (e) {
      console.error("[Booking] getMyBookings error:", e);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // POST /booking/:id/accept|decline|cancel
  async updateStatus(req, res) {
    try {
      const id = req.params?.id;
      const action = (req.params?.action || "").toLowerCase(); // accept|decline|cancel
      if (!id || !["accept", "decline", "cancel"].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid parameters" });
      }
      const mapping = { accept: "Accepted", decline: "Declined", cancel: "Cancelled" };
      const status = mapping[action];
      const pool = await getPool();
      await pool.request()
        .input("Id", sql.UniqueIdentifier, id)
        .input("Status", sql.NVarChar, status)
        .query(`
          UPDATE BookedSchedules SET ScheduleStatus = @Status WHERE BookedScheduleId = @Id
        `);
      return res.status(200).json({ success: true, message: "Status updated" });
    } catch (e) {
      console.error("[Booking] updateStatus error:", e);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

module.exports = new BookingController();


