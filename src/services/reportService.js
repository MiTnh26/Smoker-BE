const { success, error } = require("../utils/response");
const ReportModel = require("../models/reportModel");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const crypto = require("crypto");

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isGuid(value) {
  if (!value) return false;
  const str = String(value).trim();
  if (!str) return false;
	return GUID_REGEX.test(str);
}

function hashToGuid(seed) {
	const buffer = crypto.createHash("sha1").update(String(seed)).digest().subarray(0, 16);
	// Set version (4) and variant bits per RFC 4122
	buffer[6] = (buffer[6] & 0x0f) | 0x40;
	buffer[8] = (buffer[8] & 0x3f) | 0x80;
	const hex = buffer.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeGuid(value, fallbackSeed) {
  if (!value) {
		return fallbackSeed ? hashToGuid(fallbackSeed) : null;
  }
  const str = String(value).trim();
  if (!str) {
		return fallbackSeed ? hashToGuid(fallbackSeed) : null;
  }
  if (isGuid(str)) {
    return str.toLowerCase();
  }
	return hashToGuid(str);
}
exports.createReport = async (data) => {
	try {
		let processedData = { ...data };

		if (data.ReporterId) {
			const reporterEntityId = await getEntityAccountIdByAccountId(data.ReporterId);
			if (reporterEntityId) {
				processedData.ReporterId = normalizeGuid(reporterEntityId);
			} else {
				processedData.ReporterId = normalizeGuid(data.ReporterId);
			}
		}

		if (!processedData.ReporterId) {
			return error("ReporterId is required", 400);
		}

		if (data.TargetOwnerId) {
			const entityAccountId = await getEntityAccountIdByAccountId(data.TargetOwnerId);
			if (entityAccountId) {
				processedData.TargetOwnerId = normalizeGuid(entityAccountId);
			} else {
				processedData.TargetOwnerId = normalizeGuid(data.TargetOwnerId);
			}
		} else {
			processedData.TargetOwnerId = null;
		}

		processedData.TargetId = normalizeGuid(
			data.TargetId,
			data.TargetType ? `${data.TargetType}:${data.TargetId || data.TargetOwnerId || Date.now()}` : null
		);

		const report = await ReportModel.createReport(processedData);
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
		const normalizedTargetId = normalizeGuid(
			targetId,
			targetType ? `${targetType}:${targetId}` : targetId
		);
		if (!normalizedTargetId) {
			return error("Invalid targetId", 400);
		}
		const reports = await ReportModel.getReportsByTarget(targetType, normalizedTargetId);
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
		const normalizedReporterId = normalizeGuid(reporterId);
		if (!normalizedReporterId) {
			return error("Invalid reporterId", 400);
		}
		const reports = await ReportModel.getReportsByReporter(normalizedReporterId);
		return success("Fetched reports by reporter.", reports);
	} catch (err) {
		return error("Error fetching reports by reporter: " + err.message, 500);
	}
};