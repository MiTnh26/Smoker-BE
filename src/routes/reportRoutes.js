const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const reportController = require("../controllers/reportController");    

router.post("/", verifyToken, reportController.createReport);
router.get("/", verifyToken, reportController.getAllReports);
router.get("/target/:targetType/:targetId", verifyToken, reportController.getReportsByTarget);
router.patch("/:reportId/status", verifyToken, reportController.updateReportStatus);
router.get("/reporter/:reporterId", verifyToken, reportController.getReportsByReporter);

module.exports = router;
