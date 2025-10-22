const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");
const createCloudinaryUpload = require("../middleware/uploadCloudinary");

router.get("/me", verifyToken, userController.me);

const uploadUser = createCloudinaryUpload("users");
// Wrap multer to surface errors as JSON instead of crashing with 500
router.put(
  "/profile",
  verifyToken,
  (req, res, next) => {
    req.body.entityId = req.user.id; // UserId
    next();
  },
  uploadUser.fields([
    { name: "avatar", maxCount: 1 },
    { name: "background", maxCount: 1 }
  ]),
  userController.updateProfile
);

module.exports = router;


