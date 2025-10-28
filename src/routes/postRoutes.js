const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { verifyToken } = require("../middleware/authMiddleware");

// Routes không cần authentication (public routes)
router.get("/", postController.getAllPosts);
router.get("/search", postController.searchPosts);
router.get("/search/title", postController.searchPostsByTitle);
router.get("/search/author", postController.searchPostsByAuthor);

// Routes cho Comments (cần auth) - phải đặt trước routes có :id
router.post("/:postId/comments", verifyToken, postController.addComment);
router.delete("/:postId/comments/:commentId", verifyToken, postController.deleteComment);

// Routes cho Comment Likes (cần auth) - đặt trước routes replies
router.post("/:postId/comments/:commentId/like", verifyToken, postController.likeComment);
router.delete("/:postId/comments/:commentId/like", verifyToken, postController.unlikeComment);

// Routes cho Reply Likes (cần auth) - ĐẶT TRƯỚC routes replies vì dài hơn
router.post("/:postId/comments/:commentId/replies/:replyId/like", verifyToken, postController.likeReply);
router.delete("/:postId/comments/:commentId/replies/:replyId/like", verifyToken, postController.unlikeReply);

// Routes cho Replies (cần auth) - đặt sau routes likes
router.post("/:postId/comments/:commentId/replies/:replyId", verifyToken, postController.addReplyToReply); // Reply vào reply
router.post("/:postId/comments/:commentId/replies", verifyToken, postController.addReply); // Reply vào comment
router.delete("/:postId/comments/:commentId/replies/:replyId", verifyToken, postController.deleteReply); // Xóa reply

// Routes cho Post Likes (cần auth)
router.post("/:postId/like", verifyToken, postController.likePost);
router.delete("/:postId/like", verifyToken, postController.unlikePost);

// Routes cần authentication (private routes)
router.post("/", verifyToken, postController.createPost);
router.put("/:id", verifyToken, postController.updatePost);
router.delete("/:id", verifyToken, postController.deletePost);

// Routes không cần authentication (public routes) - phải đặt cuối
router.get("/:id", postController.getPostById);

module.exports = router;

