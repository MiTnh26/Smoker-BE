const express = require("express");
const router = express.Router();
const adController = require("../controllers/adController");
const { verifyToken, requireAdmin, requireBarPage } = require("../middleware/authMiddleware");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");

// ============================================================
// ROUTES CHO REVIVE AD SERVER (Existing)
// ============================================================
router.get("/revive", verifyToken, adController.getReviveAd);
router.get("/revive/invocation", verifyToken, adController.getReviveInvocationCode);

// ============================================================
// ROUTES CHO STATIC ADS (Existing)
// ============================================================
router.get("/static", verifyToken, adController.getStaticAd);
router.post("/track/impression", verifyToken, adController.trackImpression);
router.post("/track/click", verifyToken, adController.trackClick);
router.get("/dashboard/:barPageId", verifyToken, adController.getDashboardStats);

// ============================================================
// ROUTES CHO AUCTION SYSTEM (New)
// ============================================================
router.get("/auction", verifyToken, adController.getAdAfterAuction);
router.get("/auction/stats", verifyToken, requireAdmin, adController.getAuctionStats);

// ============================================================
// ROUTES CHO IMPRESSION TRACKING (Enhanced)
// ============================================================
router.post("/track/dynamic-impression", verifyToken, adController.trackDynamicImpression);

// ============================================================
// ROUTES CHO BAR PAGE - QUẢN LÝ QUẢNG CÁO
// ============================================================

// Upload middleware cho ad image
const uploadAdImage = createCloudinaryUpload("ads");

// BarPage tạo quảng cáo
router.post(
  "/create",
  verifyToken,
  requireBarPage,
  (req, res, next) => {
    req.entityId = req.user?.id || "ads";
    next();
  },
  uploadAdImage.single("image"),
  adController.createUserAd
);

// Lấy quảng cáo của BarPage
router.get("/my-ads", verifyToken, requireBarPage, adController.getMyAds);

// Lấy danh sách gói quảng cáo (cho BarPage chọn)
router.get("/packages", verifyToken, adController.getPackages);

// BarPage mua gói quảng cáo
router.post("/purchase", verifyToken, requireBarPage, adController.purchasePackage);

// Dashboard stats cho BarPage
router.get("/bar-dashboard/:barPageId", verifyToken, requireBarPage, adController.getBarDashboardStats);

module.exports = router;