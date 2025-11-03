const express = require("express");
const router = express.Router();
const storyController = require("../controllers/storyController");
const postController = require("../controllers/postController");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");
const { verifyToken } = require("../middleware/authMiddleware");

// Middleware upload cho story (dùng Cloudinary, folder: stories)
// const uploadStory = createCloudinaryUpload("users");

// Lấy danh sách story (public)
router.get("/", storyController.getStories);

// Tạo story (có upload ảnh)
router.post(
	"/",
	verifyToken,
	(req, res, next) => {
		if (!req.body) req.body = {};
		if (!req.user) {
			return res.status(401).json({ status: "error", message: "Unauthorized" });
		}
		req.entityId = req.user.id;
		next();
	},
		(req, res, next) => {
			const handler = uploadStory.fields([
				{ name: "images", maxCount: 1 }
			]);
			handler(req, res, (err) => {
				if (err) {
					return res.status(400).json({ status: "error", message: err.message || "Upload failed" });
				}
				// Nếu có file upload, gán URL vào req.body.images
				if (req.files && req.files.images && req.files.images[0] && req.files.images[0].path) {
					req.body.images = req.files.images[0].path;
				}
				next();
			});
		},
		postController.createPost
);

// Cập nhật, xóa, lấy chi tiết story (có thể dùng lại controller post)
router.put("/:id", verifyToken, postController.updatePost);
router.delete("/:id", verifyToken, postController.deletePost);
router.get("/:id", postController.getPostById);

module.exports = router;
