// routes/barPageRoutes.js
const express = require("express");
const router = express.Router();
const { barPageController } = require("../controllers");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");
const { verifyToken, requireActiveEntity } = require("../middleware/authMiddleware");

// Debug middleware để log tất cả requests
router.use((req, res, next) => {
  console.log(`[BarPageRoutes] ${req.method} ${req.path}`, {
    originalUrl: req.originalUrl,
    params: req.params,
    query: req.query
  });
  next();
});

// 1) Tạo mới trang Bar (có thể có hoặc không upload file)
router.post("/register", verifyToken, barPageController.registerBarPage);

// Landing page - featured bars
router.get("/", barPageController.getFeaturedBars);

// 2) Lấy danh sách hoặc thông tin chi tiết
// QUAN TRỌNG: Route này PHẢI được đặt TRƯỚC route /:barPageId để tránh conflict
router.get("/account/:accountId", (req, res, next) => {
  console.log(`[BarPageRoutes] Matched /account/:accountId route with accountId: ${req.params.accountId}`);
  next();
}, barPageController.getBarPageByAccountId);

// IMPORTANT: Place specific routes before parameterized routes to avoid conflicts
// For example, if there's a /dashboard route, it should be here before /:barPageId
// Currently, /dashboard would be caught by /:barPageId, so we validate GUID format in controller

router.get("/:barPageId", barPageController.getBarPageById);

// 3) Upload avatar/background cho BarPage hiện có
const uploadBarPage = createCloudinaryUpload("barpages");

router.post(
  "/upload",
  verifyToken,
  requireActiveEntity,
  // Map entityId -> accountId nếu có, để xác định thư mục Cloudinary
  (req, res, next) => {
    if (req.body && req.body.entityId && !req.body.accountId)
      req.body.accountId = req.body.entityId;
    next();
  },
  (req, res, next) =>
    uploadBarPage.fields([
      { name: "avatar", maxCount: 1 },
      { name: "background", maxCount: 1 },
    ])(req, res, (err) => {
      if (err)
        return res
          .status(400)
          .json({ status: "error", message: err.message || "Upload failed" });
      next();
    }),
  barPageController.updateBarPageInfo
);

// 4) Update bar page by EntityAccountId (PUT /bar/:entityAccountId)
router.put("/:entityAccountId", verifyToken, requireActiveEntity, barPageController.updateBarPageByEntityAccountId);

// 5) Xóa trang bar
router.delete("/:barPageId", verifyToken, requireActiveEntity, barPageController.deleteBarPage);

module.exports = router;
