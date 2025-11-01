const express = require("express");
const router = express.Router();
const followController = require("../controllers/followController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/follow", verifyToken, followController.followEntity);
router.post("/unfollow", verifyToken, followController.unfollowEntity);
router.get("/followers/:entityId", followController.getFollowers);
router.get("/following/:entityId", followController.getFollowing);
router.get("/check", followController.checkFollowing);

module.exports = router;


