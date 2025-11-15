const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { userController } = require("../controllers");
const createCloudinaryUpload = require("../middleware/uploadCloudinary");

router.get("/me", verifyToken, userController.me);
router.get("/:accountId/entities", verifyToken, userController.getEntities);
const uploadUser = createCloudinaryUpload("users");

router.put(
  "/profile",
  verifyToken,
  (req, res, next) => {
    if (!req.body) req.body = {};
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }
  
    req.entityId = req.user.id;
    console.log("entityId for upload:", req.user.id);
    next();
  },
  
  
  // Wrap multer to send JSON error if upload fails
  (req, res, next) => {
    const handler = uploadUser.fields([
      { name: "avatar", maxCount: 1 },
      { name: "background", maxCount: 1 },
    ]);
    handler(req, res, (err) => {
      if (err) {
        return res.status(400).json({ status: "error", message: err.message || "Upload failed" });
      }
      next();
    });
  },
  userController.updateProfile
);

module.exports = router;


