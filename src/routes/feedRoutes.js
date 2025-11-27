const express = require("express");
const router = express.Router();
const feedController = require("../controllers/feedController");
const { verifyToken } = require("../middleware/authMiddleware");

// GET /api/feed - Lấy feed chính đã được tổng hợp
router.get("/", verifyToken, feedController.getFeed);

module.exports = router;

