const express = require("express");
const router = express.Router();
const storyController = require("../controllers/storyController");

// Lấy danh sách story (public)
router.get("/", storyController.getStories);

module.exports = router;
