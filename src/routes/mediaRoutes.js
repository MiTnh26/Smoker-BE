const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");

// GET /medias/by-url?postId=xxx&url=xxx - Lấy media theo postId và URL
router.get("/by-url", mediaController.getMediaByUrl);

// GET /medias/:mediaId - Lấy chi tiết media theo ID
router.get("/:mediaId", mediaController.getMediaById);

module.exports = router;

