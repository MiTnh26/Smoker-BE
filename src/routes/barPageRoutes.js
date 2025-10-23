// routes/barPageRoutes.js
const express = require("express");
const router = express.Router();
const { barPageController } = require("../controllers");
const createCloudinaryUpload = require("../middleware/uploadCloudinary");

// 1) Tạo mới trang Bar (có thể có hoặc không upload file)
router.post("/register", barPageController.registerBarPage);

// 2) Lấy danh sách hoặc thông tin chi tiết
router.get("/account/:accountId", barPageController.getBarPageByAccountId);
router.get("/:barPageId", barPageController.getBarPageById);

// 3) Upload avatar/background cho BarPage hiện có
const uploadBarPage = createCloudinaryUpload("barpages");

router.post(
  "/upload",
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

// 4) Xóa trang bar
router.delete("/:barPageId", barPageController.deleteBarPage);

module.exports = router;
