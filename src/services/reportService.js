const { success, error } = require("../utils/response");
const ReportModel = require("../models/reportModel");

exports.createReport = async (data) => {
	try {
		const report = await ReportModel.createReport(data);
		return success("Report created successfully.", report);
	} catch (err) {
		return error("Error creating report: " + err.message, 500);
	}
};

exports.getAllReports = async () => {
	try {
		const reports = await ReportModel.getAllReports();
		return success("Fetched all reports.", reports);
	} catch (err) {
		return error("Error fetching reports: " + err.message, 500);
	}
};

exports.getReportsByTarget = async (targetType, targetId) => {
	try {
		const reports = await ReportModel.getReportsByTarget(targetType, targetId);
		return success("Fetched reports for target.", reports);
	} catch (err) {
		return error("Error fetching reports for target: " + err.message, 500);
	}
};

exports.updateReportStatus = async (reportId, status) => {
	try {
		const affected = await ReportModel.updateReportStatus(reportId, status);
		if (affected === 0) return error("Report not found.", 404);
		return success("Report status updated.");
	} catch (err) {
		return error("Error updating report status: " + err.message, 500);
	}
};

exports.getReportsByReporter = async (reporterId) => {
	try {
		const reports = await ReportModel.getReportsByReporter(reporterId);
		return success("Fetched reports by reporter.", reports);
	} catch (err) {
		return error("Error fetching reports by reporter: " + err.message, 500);
	}
};