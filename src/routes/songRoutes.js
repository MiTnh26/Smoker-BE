const express = require("express");
const multer = require("multer");
const { streamSong, streamSongById, addSong, deleteSong, getSongs } = require("../controllers/songController.js");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Public: list and stream
router.get("/", getSongs);
router.get("/stream/:filename", streamSong);

// Admin only: upload and delete
router.post("/upload", verifyToken, requireAdmin, upload.single("file"), addSong);
router.delete("/delete/:id", verifyToken, requireAdmin, deleteSong);

module.exports = router;