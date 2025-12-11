const express = require("express");
const router = express.Router();
const followController = require("../controllers/followController");
const { verifyToken, optionalVerifyToken } = require("../middleware/authMiddleware");

router.post("/follow", verifyToken, followController.followEntity);
router.post("/unfollow", verifyToken, followController.unfollowEntity);
// Cho phép truyền token để backend biết ai đang xem (để đẩy account của chính mình lên đầu),
// nhưng không bắt buộc để vẫn hỗ trợ trường hợp xem public.
router.get("/followers/:entityAccountId", optionalVerifyToken, followController.getFollowers);
router.get("/following/:entityAccountId", optionalVerifyToken, followController.getFollowing);
router.get("/check", followController.checkFollowing);

module.exports = router;


