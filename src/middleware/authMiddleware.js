const jwt = require("jsonwebtoken");
const { getPool, sql } = require("../db/sqlserver");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ status: "error", message: "Thiếu token" });
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ status: "error", message: "Token không hợp lệ" });
    req.user = payload; // { id, email, role, entityAccountId?, entityType?, entityId? }
    next();
  });
}

function optionalVerifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return next();
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
      if (!err && payload) {
        req.user = payload;
      }
      next();
    });
  } catch (error) {
    next(); // Không chặn request nếu token không hợp lệ
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ status: "error", message: "Unauthenticated" });
  
  // Cho phép Manager hoặc Admin (từ Accounts với Role = 'Admin')
  const userType = req.user.type; // "manager" hoặc undefined (user)
  const role = String(req.user.role || "").toLowerCase();
  
  if (userType === "manager" || role === "admin") {
    return next();
  }
  
  return res.status(403).json({ status: "error", message: "Admin/Manager only" });
}

async function requireActiveEntity(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    // Nếu là Account (Customer), cho phép luôn (không cần check status)
    if (!req.user.entityAccountId || req.user.entityType === 'Account') {
      // Kiểm tra Account status từ checkBannedStatus đã xử lý rồi
      return next();
    }

    // Chỉ check status cho BusinessAccount và BarPage
    const { entityAccountId, entityType } = req.user;
    const pool = await getPool();
    let result;

    if (entityType === 'BusinessAccount') {
      result = await pool.request()
        .input("id", sql.UniqueIdentifier, entityAccountId)
        .query(`SELECT Status FROM BussinessAccounts WHERE BussinessAccountId = (SELECT EntityId FROM EntityAccounts WHERE EntityAccountId = @id)`);
    } else if (entityType === 'BarPage') {
      result = await pool.request()
        .input("id", sql.UniqueIdentifier, entityAccountId)
        .query(`SELECT Status FROM BarPages WHERE BarPageId = (SELECT EntityId FROM EntityAccounts WHERE EntityAccountId = @id)`);
    } else {
      // Nếu không phải BusinessAccount, BarPage, hoặc Account thì không cho phép
      return res.status(403).json({ status: "error", message: "Loại tài khoản không được hỗ trợ." });
    }

    const entity = result.recordset[0];
    if (!entity) {
        return res.status(404).json({ status: "error", message: "Không tìm thấy tài khoản kinh doanh tương ứng." });
    }

    if (entity.Status !== 'active') {
      return res.status(403).json({ 
        status: "error", 
        message: "Tài khoản của bạn đang chờ duyệt hoặc đã bị khóa. Vui lòng liên hệ quản trị viên.",
        code: "ENTITY_NOT_ACTIVE"
      });
    }

    next();
  } catch (err) {
    console.error("[requireActiveEntity] Middleware error:", err);
    return res.status(500).json({ status: "error", message: "Lỗi máy chủ khi xác thực." });
  }
}

async function checkBannedStatus(req, res, next) {
  try {
    const accountId = req.user?.id;
    if (!accountId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const pool = await getPool();

    // Check Account status first
    const accountCheck = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`SELECT Status FROM Accounts WHERE AccountId = @AccountId`);

    if (accountCheck.recordset[0]?.Status === 'banned') {
      return res.status(403).json({ 
        status: "error", 
        message: "Tài khoản của bạn đã bị cấm. Liên hệ smokerteam@gmail.com" 
      });
    }

    // Check associated BusinessAccount status
    const businessCheck = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 ba.Status 
        FROM BussinessAccounts ba
        INNER JOIN EntityAccounts ea ON ea.EntityId = ba.BussinessAccountId AND ea.EntityType = 'BusinessAccount'
        WHERE ea.AccountId = @AccountId AND ba.Status = 'banned'
      `);
    if (businessCheck.recordset.length > 0) {
      return res.status(403).json({ 
        status: "error", 
        message: "Tài khoản của bạn đã bị cấm. Liên hệ smokerteam@gmail.com" 
      });
    }

    // Check associated BarPage status
    const barCheck = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 bp.Status 
        FROM BarPages bp
        INNER JOIN EntityAccounts ea ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
        WHERE ea.AccountId = @AccountId AND bp.Status = 'banned'
      `);
    if (barCheck.recordset.length > 0) {
      return res.status(403).json({ 
        status: "error", 
        message: "Tài khoản của bạn đã bị cấm. Liên hệ smokerteam@gmail.com" 
      });
    }

    next();
  } catch (err) {
    console.error("[checkBannedStatus] Error:", err);
    return res.status(500).json({ status: "error", message: "Lỗi kiểm tra trạng thái" });
  }
}

async function requireBarPage(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const accountId = req.user?.id;
    if (!accountId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const pool = await getPool();

    // Check if user has a BarPage entity
    const barPageCheck = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 bp.BarPageId, bp.Status, ea.EntityAccountId
        FROM BarPages bp
        INNER JOIN EntityAccounts ea ON ea.EntityId = bp.BarPageId AND ea.EntityType = 'BarPage'
        WHERE ea.AccountId = @AccountId
      `);

    if (barPageCheck.recordset.length === 0) {
      return res.status(403).json({ 
        status: "error", 
        message: "Chỉ quán bar mới có thể thực hiện thao tác này" 
      });
    }

    const barPage = barPageCheck.recordset[0];
    if (barPage.Status !== 'active') {
      return res.status(403).json({ 
        status: "error", 
        message: "Quán bar của bạn đang chờ duyệt hoặc đã bị khóa. Vui lòng liên hệ quản trị viên." 
      });
    }

    // Attach barPageId to request for convenience
    req.barPageId = barPage.BarPageId;
    next();
  } catch (err) {
    console.error("[requireBarPage] Middleware error:", err);
    return res.status(500).json({ status: "error", message: "Lỗi máy chủ khi xác thực." });
  }
}

module.exports = { verifyToken, optionalVerifyToken, requireAdmin, requireActiveEntity, checkBannedStatus, requireBarPage };
