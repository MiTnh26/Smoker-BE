const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  console.log('Headers:', req.headers);
  const authHeader = req.headers.authorization || "";
  console.log('Auth header:', authHeader);
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  console.log('Token:', token);
  
  if (!token) return res.status(401).json({ status: "error", message: "Thiếu token" });
  
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      console.log('Token verification error:', err);
      return res.status(403).json({ status: "error", message: "Token không hợp lệ" });
    }
    console.log('Token payload:', payload);
    req.user = payload; // { id, email, role }
    next();
  });
}

module.exports = { verifyToken };
