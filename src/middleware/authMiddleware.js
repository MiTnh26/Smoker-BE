const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  console.log("🔐 Auth Middleware - Starting verification");
  console.log("🔐 Request headers:", req.headers);
  
  const authHeader = req.headers.authorization || "";
  console.log("🔐 Auth header:", authHeader);
  
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  console.log("🔐 Extracted token:", token ? "Token exists" : "No token");
  
  if (!token) {
    console.log("❌ No token found, returning 401");
    return res.status(401).json({ status: "error", message: "Thiếu token" });
  }
  
  console.log("🔐 JWT Secret exists:", !!process.env.JWT_SECRET);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      console.log("❌ Token verification failed:", err.message);
      return res.status(403).json({ status: "error", message: "Token không hợp lệ" });
    }
    console.log("✅ Token verified successfully, payload:", payload);
    req.user = payload; // { id, email, role }
    next();
  });
}

/**
 * Middleware kiểm tra user có phải admin không
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  const role = req.user.role?.toLowerCase() || "";
  if (role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  
  next();
}

/**
 * Middleware kiểm tra user có phải BarPage không
 */
async function requireBarPage(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  const userAdvertisementModel = require("../models/userAdvertisementModel");
  const accountId = req.user.id || req.user.accountId;
  
  if (!accountId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  try {
    const isBar = await userAdvertisementModel.isBarPage(accountId);
    if (!isBar) {
      return res.status(403).json({ success: false, message: "Chỉ quán bar mới có thể thực hiện thao tác này" });
    }
    next();
  } catch (error) {
    console.error("[requireBarPage] Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { verifyToken, requireAdmin, requireBarPage };
