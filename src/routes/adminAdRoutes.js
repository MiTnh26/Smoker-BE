const express = require("express");
const router = express.Router();
const adminAdController = require("../controllers/adminAdController");
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");

// ============================================================
// ROUTES CHO ADMIN - QUẢN LÝ GÓI QUẢNG CÁO
// ============================================================

// Packages CRUD
router.get("/ads/packages", verifyToken, requireAdmin, adminAdController.getAllPackages);
router.get("/ads/packages/stats", verifyToken, requireAdmin, adminAdController.getPackageStats);
router.get("/ads/packages/:packageId", verifyToken, requireAdmin, adminAdController.getPackageById);
router.post("/ads/packages", verifyToken, requireAdmin, adminAdController.createPackage);
router.put("/ads/packages/:packageId", verifyToken, requireAdmin, adminAdController.updatePackage);
router.delete("/ads/packages/:packageId", verifyToken, requireAdmin, adminAdController.deletePackage);

// ============================================================
// ROUTES CHO ADMIN - QUẢN LÝ QUẢNG CÁO
// ============================================================

// Ads management
router.get("/ads", verifyToken, requireAdmin, adminAdController.getAllAds);
router.get("/ads/pending", verifyToken, requireAdmin, adminAdController.getPendingAds);
router.get("/ads/:userAdId", verifyToken, requireAdmin, adminAdController.getAdById);
router.post("/ads/:userAdId/approve", verifyToken, requireAdmin, adminAdController.approveAd);
router.post("/ads/:userAdId/reject", verifyToken, requireAdmin, adminAdController.rejectAd);

// Event-based ad purchases
router.get("/ads/event-purchases/pending", verifyToken, requireAdmin, adminAdController.getPendingEventPurchases);
router.post("/ads/event-purchases/:purchaseId/approve", verifyToken, requireAdmin, adminAdController.approveEventPurchase);

module.exports = router;


