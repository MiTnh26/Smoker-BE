const express = require("express");
const router = express.Router();
const postController = require("../controllers/postController");
const { verifyToken } = require("../middleware/authMiddleware");
const { createPostUpload } = require("../middleware/uploadCloudinary");

// Tạo instance upload cho posts
const uploadPost = createPostUpload();

// Routes không cần authentication (public routes)
router.get("/", postController.getAllPosts);
router.get("/search", postController.searchPosts);
router.get("/search/title", postController.searchPostsByTitle);
router.get("/search/author", postController.searchPostsByAuthor);
router.get("/author/:authorId", postController.getPostsByAuthor);

// Routes cho Comments (cần auth) - phải đặt trước routes có :id
router.post("/:postId/comments", verifyToken, postController.addComment);
router.put("/:postId/comments/:commentId", verifyToken, postController.updateComment);
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
router.put("/:postId/comments/:commentId/replies/:replyId", verifyToken, postController.updateReply); // Cập nhật reply
router.delete("/:postId/comments/:commentId/replies/:replyId", verifyToken, postController.deleteReply); // Xóa reply

// Routes cho Post Likes (cần auth)
router.post("/:postId/like", verifyToken, postController.likePost);
router.delete("/:postId/like", verifyToken, postController.unlikePost);

// Routes để track views và shares (phải đặt trước routes có :id để tránh conflict)
router.post("/:postId/view", postController.trackView); // Public - ai cũng có thể track view
router.post("/:postId/share", verifyToken, postController.trackShare); // Cần auth để share

// Routes cần authentication (private routes)
router.post("/", verifyToken, postController.createPost);
router.post("/upload", verifyToken, uploadPost.fields([
  { name: "images", maxCount: 10 },
  { name: "videos", maxCount: 5 },
  { name: "audio", maxCount: 3 }
]), postController.uploadPostMedia);
router.put("/:id", verifyToken, postController.updatePost);
router.delete("/:id", verifyToken, postController.deletePost);

// Routes cho Trash (cần auth) - đặt trước routes có :id để tránh conflict
router.get("/trash", verifyToken, postController.getTrashedPosts);
router.post("/:id/trash", verifyToken, postController.trashPost);
router.post("/:id/restore", verifyToken, postController.restorePost);

// Routes không cần authentication (public routes) - phải đặt cuối
router.get("/:id", postController.getPostById);

module.exports = router;

