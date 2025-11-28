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

// Ads management - Specific routes first (before parameter routes)
router.get("/ads", verifyToken, requireAdmin, adminAdController.getAllAds);
router.get("/ads/pending", verifyToken, requireAdmin, adminAdController.getPendingAds);

// Event-based ad purchases - MUST be before /ads/:userAdId route
router.get("/ads/event-purchases/pending", verifyToken, requireAdmin, adminAdController.getPendingEventPurchases);
router.get("/ads/event-purchases", verifyToken, requireAdmin, adminAdController.getAllEventPurchases);
router.post("/ads/event-purchases/:purchaseId/approve", verifyToken, requireAdmin, adminAdController.approveEventPurchase);

// Revive sync routes - MUST be before /ads/:userAdId route
router.get("/ads/sync-revive/debug", verifyToken, requireAdmin, adminAdController.debugSyncStatus);
router.post("/ads/sync-revive/trigger", verifyToken, requireAdmin, adminAdController.triggerSyncJob);
router.post("/ads/sync-revive", verifyToken, requireAdmin, adminAdController.syncAllAdsFromRevive);

// Pause requests routes - MUST be before /ads/:userAdId route
router.get("/ads/pause-requests", verifyToken, requireAdmin, adminAdController.getPauseRequests);
router.get("/ads/pause-requests/:pauseRequestId", verifyToken, requireAdmin, adminAdController.getPauseRequestById);
router.post("/ads/pause-requests/:pauseRequestId/approve", verifyToken, requireAdmin, adminAdController.approvePauseRequest);
router.post("/ads/pause-requests/:pauseRequestId/reject", verifyToken, requireAdmin, adminAdController.rejectPauseRequest);
router.post("/ads/pause-requests/:pauseRequestId/complete", verifyToken, requireAdmin, adminAdController.completePauseRequest);

// Resume requests routes - MUST be before /ads/:userAdId route
router.get("/ads/resume-requests", verifyToken, requireAdmin, adminAdController.getResumeRequests);
router.get("/ads/resume-requests/:resumeRequestId", verifyToken, requireAdmin, adminAdController.getResumeRequestById);
router.post("/ads/resume-requests/:resumeRequestId/approve", verifyToken, requireAdmin, adminAdController.approveResumeRequest);
router.post("/ads/resume-requests/:resumeRequestId/reject", verifyToken, requireAdmin, adminAdController.rejectResumeRequest);
router.post("/ads/resume-requests/:resumeRequestId/complete", verifyToken, requireAdmin, adminAdController.completeResumeRequest);

// Parameter routes (must be last)
router.get("/ads/:userAdId", verifyToken, requireAdmin, adminAdController.getAdById);
router.post("/ads/:userAdId/approve", verifyToken, requireAdmin, adminAdController.approveAd);
router.post("/ads/:userAdId/reject", verifyToken, requireAdmin, adminAdController.rejectAd);
router.post("/ads/:userAdId/sync-revive", verifyToken, requireAdmin, adminAdController.syncAdFromRevive);

module.exports = router;


