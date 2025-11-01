const reportService = require("../services/reportService");

// Create a new report
exports.createReport = async (req, res) => {
    const data = req.body;
    if (!data.ReporterId || !data.ReporterRole || !data.TargetType || !data.TargetId || !data.Reason) {
        return res.status(400).json({ message: "Missing required fields." });
    }
    const result = await reportService.createReport(data);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.status(201).json(result);
};

// Get all reports
exports.getAllReports = async (req, res) => {
    const result = await reportService.getAllReports();
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};

// Get reports by target
exports.getReportsByTarget = async (req, res) => {
    const { targetType, targetId } = req.params;
    if (!targetType || !targetId) {
        return res.status(400).json({ message: "Missing targetType or targetId." });
    }
    const result = await reportService.getReportsByTarget(targetType, targetId);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};

// Update report status
exports.updateReportStatus = async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;
    if (!reportId || !status) {
        return res.status(400).json({ message: "Missing reportId or status." });
    }
    const result = await reportService.updateReportStatus(reportId, status);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};

// Get reports by reporter
exports.getReportsByReporter = async (req, res) => {
    const { reporterId } = req.params;
    if (!reporterId) {
        return res.status(400).json({ message: "Missing reporterId." });
    }
    const result = await reportService.getReportsByReporter(reporterId);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};
