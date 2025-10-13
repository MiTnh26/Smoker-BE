const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ status: "error", message: "Thiếu token" });
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ status: "error", message: "Token không hợp lệ" });
    req.user = payload; // { id, email, role }
    next();
  });
}

module.exports = { verifyToken };
