const express = require("express");
const router = express.Router();
const { livestreamController } = require("../controllers");
const { verifyToken } = require("../middleware/authMiddleware");

// All livestream routes except getting active streams require authentication
router.post("/start", verifyToken, livestreamController.startLivestream);
router.get("/active", livestreamController.getActiveLivestreams);
router.get("/channel/:channelName", livestreamController.getStreamByChannel);
router.get("/host/:hostId", livestreamController.getLivestreamsByHost);

// Scheduled livestream routes (must be before /:id routes)
router.post("/schedule", verifyToken, livestreamController.createScheduledLivestream);
router.get("/scheduled", verifyToken, livestreamController.getScheduledLivestreams);
router.delete("/scheduled/:id", verifyToken, livestreamController.cancelScheduledLivestream);
router.post("/scheduled/:id/activate", livestreamController.activateScheduledLivestream);

router.get("/:id", livestreamController.getLivestream);
router.post("/:id/end", verifyToken, livestreamController.endLivestream);
router.post("/:id/view", livestreamController.incrementViewCount);

module.exports = router;

