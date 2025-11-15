const express = require("express");
const router = express.Router();
const { businessController }= require("../controllers");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");

// 1) Create business account (no file upload)
router.post("/register", businessController.registerBusiness);

// Create DJ account
router.post("/register-dj", businessController.registerDJ);

// Create Dancer account
router.post("/register-dancer", businessController.registerDancer);

router.get("/all-businesses/:accountId", businessController.getBusinessesByAccountId);

router.get("/:businessId", businessController.getBusinessById);

// 2) Upload avatar/background for an existing business account
const uploadBusiness = createCloudinaryUpload("businesses");
router.post(
  "/upload",
  // Map entityId -> accountId so the upload factory puts files under correct folder
  (req, res, next) => {
    if (req.body?.entityId && !req.body.accountId) req.body.accountId = req.body.entityId;
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
