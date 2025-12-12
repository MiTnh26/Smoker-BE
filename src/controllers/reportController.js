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

// Get all reports with filters/pagination
exports.getAllReports = async (req, res) => {
    const result = await reportService.getAllReports(req.query || {});
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
    // Validate status theo schema: Pending, Review, Resolve
    const validStatuses = ["Pending", "Review", "Resolve"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
        });
    }
    const result = await reportService.updateReportStatus(reportId, status);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};

// Handle admin action (delete post, ban account, etc.)
exports.handleReportAction = async (req, res) => {
    const { reportId } = req.params;
    const { action } = req.body;
    
    if (!reportId || !action) {
        return res.status(400).json({ message: "Missing reportId or action." });
    }
    
    // requireAdmin middleware already checked admin role
    // Get admin accountId from req.user (set by verifyToken)
    const adminAccountId = req.user?.id;
    if (!adminAccountId) {
        return res.status(401).json({ message: "Unauthorized. Admin access required." });
    }
    
    // For admin actions, we can use accountId directly or get entityAccountId if needed
    // Since admin is Account type, we can use accountId as identifier
    const result = await reportService.handleReportAction(reportId, action, null, adminAccountId);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};

// Get report detail by id
exports.getReportById = async (req, res) => {
    const { reportId } = req.params;
    if (!reportId) {
        return res.status(400).json({ message: "Missing reportId." });
    }
    const result = await reportService.getReportById(reportId);
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
