const express = require("express");
const router = express.Router();
const storyController = require("../controllers/storyController");
const postController = require("../controllers/postController");
const { createCloudinaryUpload, createPostUpload } = require("../middleware/uploadCloudinary");
const { verifyToken } = require("../middleware/authMiddleware");

// Middleware upload cho story (dùng Cloudinary, folder: stories)
const uploadStory = createCloudinaryUpload("users");
// Middleware upload cho story với hỗ trợ audio (dùng createPostUpload)
const uploadStoryWithAudio = createPostUpload();

// Lấy danh sách story (cần auth để filter theo follow)
router.get("/", verifyToken, storyController.getStories);

// Đánh dấu story đã xem
router.post("/:id/view", verifyToken, storyController.markStoryAsViewed);

// Đánh dấu nhiều stories đã xem (batch)
router.post("/view", verifyToken, storyController.markStoriesAsViewed);

// Lấy danh sách story IDs đã xem (optional)
router.get("/viewed", verifyToken, storyController.getViewedStories);

// Lấy danh sách người đã xem story
router.get("/:id/viewers", verifyToken, storyController.getStoryViewers);

// Like story
router.post("/:id/like", verifyToken, storyController.likeStory);

// Unlike story
router.delete("/:id/like", verifyToken, storyController.unlikeStory);

// Tạo story (có upload ảnh và nhạc)
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
		// Upload cả images và audios (nhạc)
		const handler = uploadStoryWithAudio.fields([
			{ name: "images", maxCount: 1 },
			{ name: "audios", maxCount: 1 }
		]);
		handler(req, res, (err) => {
			if (err) {
				return res.status(400).json({ status: "error", message: err.message || "Upload failed" });
			}
			// Multer tự động parse text fields vào req.body, nhưng đảm bảo content luôn có giá trị
			if (!req.body.content && req.body.caption !== undefined) {
				req.body.content = req.body.caption || "";
			}
			if (!req.body.content) {
				req.body.content = ""; // Đảm bảo content luôn có giá trị (ít nhất là empty string)
			}
			// Nếu có file upload images, gán URL vào req.body.images
			if (req.files && req.files.images && req.files.images[0] && req.files.images[0].path) {
				req.body.images = req.files.images[0].path;
			}
			// Nếu có file upload audios, gán URL vào req.body.audios (để postController xử lý)
			if (req.files && req.files.audios && req.files.audios[0] && req.files.audios[0].path) {
				// Format theo cấu trúc mà postController mong đợi
				req.body.audios = {
					[req.files.audios[0].fieldname]: {
						url: req.files.audios[0].path,
						thumbnail: req.body.musicBackgroundImage || req.body.images || "",
						artist: req.body.artistName || "Unknown Artist"
					}
				};
			}
			next();
		});
	},
	(req, res, next) => {
		// Stories luôn có type = "story", kể cả client không truyền
		req.body.type = "story";
		next();
	},
	postController.createPost
);

// Cập nhật, xóa, lấy chi tiết story (có thể dùng lại controller post)
router.put("/:id", verifyToken, postController.updatePost);
router.delete("/:id", verifyToken, postController.deletePost);
router.get("/:id", postController.getPostById);

module.exports = router;
