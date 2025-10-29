const express = require("express");
const multer = require("multer");
const { streamSong, addSong, deleteSong, getSongs } = require("../controllers/songController.js");

const upload = multer({ storage: multer.memoryStorage() });
// const upload = multer({ dest: "uploads/" });
const router = express.Router();


// Get all songs
router.get("/", getSongs);

// Stream a song file
router.get("/stream/:filename", streamSong);

router.post("/upload", upload.single("file"), addSong);
router.delete("/delete/:id", deleteSong);

module.exports = router;