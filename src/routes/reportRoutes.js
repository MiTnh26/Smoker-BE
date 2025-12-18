const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin } = require("../middleware/authMiddleware");
const reportController = require("../controllers/reportController");    

router.post("/", verifyToken, reportController.createReport);
router.get("/", verifyToken, requireAdmin, reportController.getAllReports);
router.get("/target/:targetType/:targetId", verifyToken, reportController.getReportsByTarget);
router.get("/reporter/:reporterId", verifyToken, reportController.getReportsByReporter);
router.get("/:reportId", verifyToken, reportController.getReportById);
router.patch("/:reportId/status", verifyToken, requireAdmin, reportController.updateReportStatus);
router.post("/:reportId/actions", verifyToken, requireAdmin, reportController.handleReportAction);

module.exports = router;
