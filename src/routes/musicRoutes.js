const express = require("express");
const router = express.Router();
const musicController = require("../controllers/musicController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tất cả routes đều cần authentication
router.use(verifyToken);

// Music routes
router.post("/", musicController.createMusic);
router.get("/", musicController.getAllMusics);
router.get("/author/:authorId", musicController.getMusicsByAuthor);
router.post("/:musicId/like", musicController.likeMusic);
router.delete("/:musicId/like", musicController.unlikeMusic);

module.exports = router;
