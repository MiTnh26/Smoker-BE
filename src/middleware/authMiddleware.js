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

module.exports = { verifyToken };
