const express = require("express");
const router = express.Router();
const mediaController = require("../controllers/mediaController");
const { verifyToken } = require("../middleware/authMiddleware");

// GET /medias/by-url?postId=xxx&url=xxx - Lấy media theo postId và URL
router.get("/by-url", mediaController.getMediaByUrl);

// Routes cho Comments (cần auth) - phải đặt trước routes có :mediaId
router.post("/:mediaId/comments", verifyToken, mediaController.addComment);
router.put("/:mediaId/comments/:commentId", verifyToken, mediaController.updateComment);
router.delete("/:mediaId/comments/:commentId", verifyToken, mediaController.deleteComment);

// Routes cho Comment Likes (cần auth) - đặt trước routes replies
router.post("/:mediaId/comments/:commentId/like", verifyToken, mediaController.likeComment);
router.delete("/:mediaId/comments/:commentId/like", verifyToken, mediaController.unlikeComment);

// Routes cho Reply Likes (cần auth) - ĐẶT TRƯỚC routes replies vì dài hơn
router.post("/:mediaId/comments/:commentId/replies/:replyId/like", verifyToken, mediaController.likeReply);
router.delete("/:mediaId/comments/:commentId/replies/:replyId/like", verifyToken, mediaController.unlikeReply);

// Routes cho Replies (cần auth) - đặt sau routes likes
router.post("/:mediaId/comments/:commentId/replies/:replyId", verifyToken, mediaController.addReplyToReply); // Reply vào reply
router.post("/:mediaId/comments/:commentId/replies", verifyToken, mediaController.addCommentReply); // Reply vào comment
router.put("/:mediaId/comments/:commentId/replies/:replyId", verifyToken, mediaController.updateReply); // Cập nhật reply
router.delete("/:mediaId/comments/:commentId/replies/:replyId", verifyToken, mediaController.deleteReply); // Xóa reply

// Routes cho Media Like (cần auth) - đặt trước routes có :mediaId
router.post("/:mediaId/like", verifyToken, mediaController.likeMedia);
router.delete("/:mediaId/like", verifyToken, mediaController.unlikeMedia);

// Routes cho Share (cần auth) - đặt trước routes có :mediaId
router.post("/:mediaId/share", verifyToken, mediaController.trackShare); // Track share

// GET /medias/:mediaId - Lấy chi tiết media theo ID (phải đặt sau các routes comments)
router.get("/:mediaId", mediaController.getMediaById);

module.exports = router;

