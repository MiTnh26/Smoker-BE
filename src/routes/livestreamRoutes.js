const express = require("express");
const router = express.Router();
const { livestreamController } = require("../controllers");
const { verifyToken } = require("../middleware/authMiddleware");

// All livestream routes except getting active streams require authentication
router.post("/start", verifyToken, livestreamController.startLivestream);
router.get("/active", livestreamController.getActiveLivestreams);
router.get("/channel/:channelName", livestreamController.getStreamByChannel);
router.get("/:id", livestreamController.getLivestream);
router.post("/:id/end", verifyToken, livestreamController.endLivestream);
router.post("/:id/view", livestreamController.incrementViewCount);
router.get("/host/:hostId", livestreamController.getLivestreamsByHost);

module.exports = router;

