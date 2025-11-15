const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { userController } = require("../controllers");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");
const multer = require("multer");

router.get("/me", verifyToken, userController.me);
router.get("/:accountId/entities", verifyToken, userController.getEntities);
router.get("/entity-account/:accountId", verifyToken, userController.getEntityAccountId);
router.get("/by-entity/:entityAccountId", userController.getByEntityId);
const uploadUser = createCloudinaryUpload("users");

// Middleware to parse FormData with text fields
const parseFormData = (req, res, next) => {
  // Extract text fields from FormData and add to req.body
  // Multer by default only parses file fields, so we need to parse text manually
  if (req.is('multipart/form-data')) {
    // Text fields in FormData are already parsed by multer into req.body
    // We just need to ensure they're available
    console.log("[ROUTE] FormData received, fields:", Object.keys(req.body || {}));
  }
  next();
};

router.put(
  "/profile",
  verifyToken,
  (req, res, next) => {
    if (!req.body) req.body = {};
    if (!req.user) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }
  
    req.entityId = req.user.id;
    console.log("[ROUTE] entityId for upload:", req.user.id);
    next();
  },
  
  // Middleware to parse both file uploads and text fields
  parseFormData,
  
  // Wrap multer to send JSON error if upload fails
  (req, res, next) => {
    const handler = uploadUser.fields([
      { name: "avatar", maxCount: 1 },
      { name: "background", maxCount: 1 },
    ]);
    handler(req, res, (err) => {
      if (err) {
        console.error("[ROUTE] Upload error:", err);
        return res.status(400).json({ status: "error", message: err.message || "Upload failed" });
      }
      console.log("[ROUTE] Multer processed, files:", Object.keys(req.files || {}));
      console.log("[ROUTE] Body contains:", Object.keys(req.body || {}));
      next();
    });
  },
  userController.updateProfile
);

module.exports = router;


