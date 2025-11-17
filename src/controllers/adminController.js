
const { getPool, sql } = require("../db/sqlserver");
const Song = require("../models/songModel");

async function getStats(req, res) {
  try {
    const pool = await getPool();

    // SQL counts
    const [{ recordset: usersRs }, { recordset: barsRs }, { recordset: eventsRs }, { recordset: reportsPendingRs }] = await Promise.all([
      pool.request().query("SELECT COUNT(1) AS cnt FROM Accounts"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM BarPages"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM Events"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM Reports WHERE Status = 'Pending'")
    ]);

    // Mongo counts
    const songsCnt = await Song.countDocuments({});

    return res.json({
      success: true,
      data: {
        users: usersRs?.[0]?.cnt || 0,
        bars: barsRs?.[0]?.cnt || 0,
        events: eventsRs?.[0]?.cnt || 0,
        songs: songsCnt || 0,
        reportsPending: reportsPendingRs?.[0]?.cnt || 0,
      }
    });
  } catch (err) {
    console.error("[AdminController] getStats error:", err);
    return res.status(500).json({ success: false, message: "Failed to load stats" });
  }
}

async function listUsers(req, res) {
  try {
    const { q = "", role = "", status = "", page = 1, pageSize = 20 } = req.query;
    const { listAccounts } = require("../models/accountModel");
    const data = await listAccounts({ query: q, role, status, page: Number(page), pageSize: Number(pageSize) });
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("[AdminController] listUsers error:", err);
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
}

async function getPendingRegistrations(req, res) {
  try {
    const pool = await getPool();
    const [businesses, bars] = await Promise.all([
      pool.request().query(`
        SELECT
          ba.BussinessAccountId AS id,
          ba.UserName AS name,
          'BusinessAccount' AS type,
          ba.Role AS role,
          acc.Email AS ownerEmail,
          acc.UserName AS ownerName,
          ba.created_at AS createdAt
        FROM BussinessAccounts ba
        JOIN Accounts acc ON ba.AccountId = acc.AccountId
        WHERE ba.Status = 'pending'
      `),
      pool.request().query(`
        SELECT
          bp.BarPageId AS id,
          bp.BarName AS name,
          'BarPage' AS type,
          bp.Role AS role,
          acc.Email AS ownerEmail,
          acc.UserName AS ownerName,
          bp.created_at AS createdAt
        FROM BarPages bp
        JOIN Accounts acc ON bp.AccountId = acc.AccountId
        WHERE bp.Status = 'pending'
      `)
    ]);

    const data = [...(businesses.recordset || []), ...(bars.recordset || [])];
    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest first

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[AdminController] getPendingRegistrations error:", err);
    return res.status(500).json({ success: false, message: "Failed to load pending registrations" });
  }
}

async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ success: false, message: "status is required" });
    const { updateAccountStatus } = require("../models/accountModel");
    const u = await updateAccountStatus(id, status);
    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: u });
  } catch (err) {
    console.error("[AdminController] updateUserStatus error:", err);
    return res.status(500).json({ success: false, message: "Failed to update status" });
  }
}

async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ success: false, message: "role is required" });

    // Chỉ cho phép 'Admin' hoặc 'Customer' ở bảng Accounts
    const allowed = new Set(["Admin", "Customer"]);
    if (!allowed.has(role)) {
      return res.status(400).json({ success: false, message: "role must be 'Admin' or 'Customer'" });
    }

    const { updateAccountRole } = require("../models/accountModel");
    const u = await updateAccountRole(id, role);
    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: u });
  } catch (err) {
    console.error("[AdminController] updateUserRole error:", err);
    return res.status(500).json({ success: false, message: "Failed to update role" });
  }
}

async function updateBusinessStatus(req, res){
  try{
    const { id } = req.params; // BussinessAccountId
    const { status } = req.body || {};
    if(!status) return res.status(400).json({ success:false, message:"status is required"});
    const { updateBusinessStatus } = require("../models/businessAccountModel");
    const r = await updateBusinessStatus(id, status);
    if(!r) return res.status(404).json({ success:false, message:"Business not found"});
    return res.json({ success:true, data:r });
  }catch(err){
    console.error("[AdminController] updateBusinessStatus error:", err);
    return res.status(500).json({ success:false, message:"Failed to update business status"});
  }
}

// Admin-only: list businesses of an AccountId (no changes to user code)
async function getUserBusinesses(req, res){
  try{
    const { id } = req.params; // AccountId (uniqueidentifier)
    const pool = await getPool();

    // Lấy thực thể gắn với Account thông qua EntityAccounts
    const requestBA = pool.request().input("AccountId", sql.UniqueIdentifier, id);
    const requestBars = pool.request().input("AccountId", sql.UniqueIdentifier, id);

    const [ba, bars] = await Promise.all([
      requestBA.query(`
        SELECT 
          ba.BussinessAccountId AS id,
          ba.UserName AS name,
          ba.Role AS role,
          ba.Avatar AS avatar,
          ba.Status AS status,
          ea.EntityAccountId,
          'BusinessAccount' AS type
        FROM EntityAccounts ea
        INNER JOIN BussinessAccounts ba ON ba.BussinessAccountId = ea.EntityId
        WHERE ea.AccountId = @AccountId AND ea.EntityType = 'BusinessAccount'
        ORDER BY ba.UserName ASC
      `),
      requestBars.query(`
        SELECT 
          b.BarPageId AS id,
          b.BarName AS name,
          b.Role AS role,
          b.Avatar AS avatar,
          b.Status AS status,
          ea.EntityAccountId,
          'BarPage' AS type
        FROM EntityAccounts ea
        INNER JOIN BarPages b ON b.BarPageId = ea.EntityId
        WHERE ea.AccountId = @AccountId AND ea.EntityType = 'BarPage'
        ORDER BY b.BarName ASC
      `)
    ]);

    const data = [
      ...(ba.recordset || []),
      ...(bars.recordset || []),
    ];

    return res.json({ success:true, data });
  }catch(err){
    console.error("[AdminController] getUserBusinesses error:", err);
    return res.status(500).json({ success:false, message:"Failed to load businesses"});
  }
}

async function updateBarStatus(req, res){
  try{
    const { id } = req.params; // BarPageId
    const { status } = req.body || {};
    if(!status) return res.status(400).json({ success:false, message:"status is required"});
    const pool = await getPool();
    const rs = await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .input("Status", sql.NVarChar(20), status)
      .query(`
        UPDATE BarPages SET Status=@Status WHERE BarPageId=@id;
        SELECT BarPageId AS id, BarName AS name, Role, Status FROM BarPages WHERE BarPageId=@id;
      `);
    const row = rs.recordset?.[0];
    if(!row) return res.status(404).json({ success:false, message:"Bar not found"});
    return res.json({ success:true, data: row });
  }catch(err){
    console.error("[AdminController] updateBarStatus error:", err);
    return res.status(500).json({ success:false, message:"Failed to update bar status"});
  }
}

module.exports = { getStats, listUsers, getPendingRegistrations, updateUserStatus, updateUserRole, updateBusinessStatus, getUserBusinesses, updateBarStatus };
