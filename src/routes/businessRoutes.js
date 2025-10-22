const express = require("express");
const router = express.Router();
const businessController = require("../controllers/businessController");
const createCloudinaryUpload = require("../middleware/uploadCloudinary");

// 1) Create business account (no file upload)
router.post("/register", businessController.registerBusiness);

// 2) Upload avatar/background for an existing business account
const uploadBusiness = createCloudinaryUpload("businesses");
router.post(
  "/upload",
  // Map entityId -> accountId so the upload factory puts files under correct folder
  (req, res, next) => {
    if (req.body && req.body.entityId && !req.body.accountId) req.body.accountId = req.body.entityId;
    next();
  },
  (req, res, next) =>
    uploadBusiness.fields([
      { name: "avatar", maxCount: 1 },
      { name: "background", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ status: "error", message: err.message || "Upload failed" });
      next();
    }),
  businessController.uploadBusinessFiles
);

module.exports = router;
