const { success, error } = require("../utils/response");
const ReportModel = require("../models/reportModel");
const { getEntityAccountIdByAccountId, verifyEntityAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");
const Post = require("../models/postModel");
const postService = require("./postService");
const accountBanService = require("./accountBanService");
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

		// Normalize and validate ReporterRole theo schema: Customer/DJ/Dancer/Bar
		const validReporterRoles = ["Customer", "DJ", "Dancer", "Bar"];
		let normalizedReporterRole = data.ReporterRole;
		
		if (normalizedReporterRole) {
			// Normalize lowercase to capitalized
			const roleMap = {
				"customer": "Customer",
				"dj": "DJ",
				"dancer": "Dancer",
				"bar": "Bar"
			};
			const lowerRole = String(normalizedReporterRole).toLowerCase();
			if (roleMap[lowerRole]) {
				normalizedReporterRole = roleMap[lowerRole];
			}
			
			// Validate after normalization
			if (!validReporterRoles.includes(normalizedReporterRole)) {
				return error(`Invalid ReporterRole. Must be one of: ${validReporterRoles.join(", ")}. Received: ${data.ReporterRole}`, 400);
			}
		}
		
		processedData.ReporterRole = normalizedReporterRole;

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

		// Validate and normalize TargetType to match schema: Account/BusinessAccount/BarPages/Post/UserReview/BarReview
		const validTargetTypes = ["Account", "BusinessAccount", "BarPages", "Post", "UserReview", "BarReview"];
		let normalizedTargetType = data.TargetType === "post" ? "Post" : data.TargetType;
		// Also handle BarPage -> BarPages for backward compatibility
		if (normalizedTargetType === "BarPage") {
			normalizedTargetType = "BarPages";
		}
		if (!validTargetTypes.includes(normalizedTargetType)) {
			return error(`Invalid TargetType. Must be one of: ${validTargetTypes.join(", ")}`, 400);
		}
		processedData.TargetType = normalizedTargetType;

		// For posts, we need to store original ObjectId somewhere since DB requires GUID
		// Store originalPostId in Description as JSON metadata (preserving userDesc)
		if (normalizedTargetType === "Post") {
			if (!data.TargetId) {
				return error("TargetId is required for Post reports", 400);
			}
			const originalPostId = String(data.TargetId).trim();
			if (!originalPostId) {
				return error("TargetId cannot be empty for Post reports", 400);
			}
			
			const userDesc = data.Description || "";
			
			// Store originalPostId in Description as JSON, preserving user description
			let descObj = { userDesc: userDesc, originalPostId: originalPostId };
			processedData.Description = JSON.stringify(descObj);
			
			// Use hashToGuid to create deterministic GUID for TargetId (DB requirement)
			processedData.TargetId = hashToGuid(`post:${originalPostId}`);
		} else {
			processedData.TargetId = normalizeGuid(
				data.TargetId,
				normalizedTargetType ? `${normalizedTargetType}:${data.TargetId || data.TargetOwnerId || Date.now()}` : null
			);
		}

		const report = await ReportModel.createReport(processedData);
		return success("Report created successfully.", report);
	} catch (err) {
		return error("Error creating report: " + err.message, 500);
	}
};

// Helper to populate target info
async function populateTargetInfo(targetType, targetId) {
	try {
		const pool = await getPool();
		// Normalize targetType for comparison
		const normalizedTargetType = targetType === "post" ? "Post" : targetType;
		
		if (normalizedTargetType === "Post") {
			// Post is in MongoDB
			// targetId might be GUID or ObjectId
			// Try ObjectId first (for backward compatibility)
			let post = null;
			const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(String(targetId).trim());
			if (isValidObjectId) {
				post = await Post.findById(targetId).lean();
			}
			// If not found and targetId is GUID, originalPostId should be in report.Description
			// But we don't have report object here, so return null - will be handled in getReportById
			
			if (post) {
				return {
					id: post._id?.toString(),
					content: post.content || post.caption || "",
					title: post.title || "",
					status: post.status || "public"
				};
			}
			return null;
		}
		
		// Handle UserReview and BarReview target types
		if (normalizedTargetType === "UserReview" || normalizedTargetType === "BarReview") {
			// For reviews, TargetId should be the ReviewId (UNIQUEIDENTIFIER)
			// Return basic info - full details can be fetched from respective review endpoints
			return {
				id: String(targetId),
				type: normalizedTargetType
			};
		}
		
		// For Account/BarPages/BusinessAccount, targetId might be EntityAccountId
		// Check if it's EntityAccountId first
		let entityId = targetId;
		const entityInfo = await verifyEntityAccountId(targetId);
		// Normalize EntityType for comparison (BarPage -> BarPages)
		const normalizedEntityType = entityInfo?.EntityType === "BarPage" ? "BarPages" : entityInfo?.EntityType;
		if (entityInfo && normalizedEntityType === normalizedTargetType) {
			entityId = entityInfo.EntityId;
		}
		
		if (targetType === "Account") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, entityId)
				.query("SELECT AccountId, UserName, Avatar, Role, Status FROM Accounts WHERE AccountId = @entityId");
			if (result.recordset[0]) {
				const acc = result.recordset[0];
				return {
					id: String(acc.AccountId),
					name: acc.UserName || "",
					avatar: acc.Avatar || "",
					role: acc.Role || "",
					status: acc.Status || ""
				};
			}
			return null;
		} else if (targetType === "BarPages" || targetType === "BarPage") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, entityId)
				.query("SELECT BarPageId, BarName, Avatar, Role, Status FROM BarPages WHERE BarPageId = @entityId");
			if (result.recordset[0]) {
				const bp = result.recordset[0];
				return {
					id: String(bp.BarPageId),
					name: bp.BarName || "",
					avatar: bp.Avatar || "",
					role: bp.Role || "",
					status: bp.Status || ""
				};
			}
			return null;
		} else if (targetType === "BusinessAccount") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, entityId)
				.query("SELECT BussinessAccountId, UserName, Avatar, Role, Status FROM BussinessAccounts WHERE BussinessAccountId = @entityId");
			if (result.recordset[0]) {
				const ba = result.recordset[0];
				return {
					id: String(ba.BussinessAccountId),
					name: ba.UserName || "",
					avatar: ba.Avatar || "",
					role: ba.Role || "",
					status: ba.Status || ""
				};
			}
			return null;
		}
		return null;
	} catch (err) {
		console.error("[populateTargetInfo] Error:", err.message);
		return null;
	}
}

// Helper to populate reporter info
async function populateReporterInfo(reporterId) {
	try {
		if (!reporterId) return null;
		const entityInfo = await verifyEntityAccountId(reporterId);
		if (!entityInfo) return null;
		
		const pool = await getPool();
		const { EntityType, EntityId } = entityInfo;
		
		if (EntityType === "Account") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, EntityId)
				.query("SELECT AccountId, UserName, Avatar, Role FROM Accounts WHERE AccountId = @entityId");
			if (result.recordset[0]) {
				const acc = result.recordset[0];
				return {
					id: String(acc.AccountId),
					name: acc.UserName || "",
					avatar: acc.Avatar || "",
					role: acc.Role || ""
				};
			}
		} else if (EntityType === "BarPage") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, EntityId)
				.query("SELECT BarPageId, BarName, Avatar, Role FROM BarPages WHERE BarPageId = @entityId");
			if (result.recordset[0]) {
				const bp = result.recordset[0];
				return {
					id: String(bp.BarPageId),
					name: bp.BarName || "",
					avatar: bp.Avatar || "",
					role: bp.Role || ""
				};
			}
		} else if (EntityType === "BusinessAccount") {
			const result = await pool.request()
				.input("entityId", sql.UniqueIdentifier, EntityId)
				.query("SELECT BussinessAccountId, UserName, Avatar, Role FROM BussinessAccounts WHERE BussinessAccountId = @entityId");
			if (result.recordset[0]) {
				const ba = result.recordset[0];
				return {
					id: String(ba.BussinessAccountId),
					name: ba.UserName || "",
					avatar: ba.Avatar || "",
					role: ba.Role || ""
				};
			}
		}
		return null;
	} catch (err) {
		console.error("[populateReporterInfo] Error:", err.message);
		return null;
	}
}

exports.getAllReports = async (query) => {
	try {
		const page = Number.parseInt(query.page, 10) || 1;
		const limit = Math.min(Number.parseInt(query.limit, 10) || 20, 100);
		
		// Filter by TargetType matching schema: Account/BusinessAccount/BarPages/Post/UserReview/BarReview
		let targetTypeFilter = query.targetType || query.type;
		// Normalize "post" to "Post" for consistency
		if (targetTypeFilter === "post") {
			targetTypeFilter = "Post";
		}
		if (targetTypeFilter && !["Post", "Account", "BarPages", "BusinessAccount", "UserReview", "BarReview"].includes(targetTypeFilter)) {
			targetTypeFilter = null;
		}
		
		const filters = {
			status: query.status,
			targetType: targetTypeFilter,
			reporterId: query.reporterId,
			search: query.search,
			page,
			limit,
		};
		const { items, total } = await ReportModel.getReports(filters, { page, limit });
		
		// Populate target and reporter info
		const populatedItems = await Promise.all(items.map(async (item) => {
			let targetInfo = await populateTargetInfo(item.TargetType, item.TargetId);
			const reporterInfo = await populateReporterInfo(item.ReporterId);
			
			// Ensure targetInfo is a simple object, not a full post/entity object
			// If targetInfo has nested objects (like author, stats, replies), extract only needed fields
			if (targetInfo && typeof targetInfo === 'object') {
				// Check if it's a full post object with nested structure
				if (targetInfo.author || targetInfo.stats || targetInfo.replies || targetInfo.createdAt) {
					// Extract only simple fields
					targetInfo = {
						id: targetInfo.id || targetInfo._id?.toString() || null,
						content: typeof targetInfo.content === 'string' ? targetInfo.content : (targetInfo.caption || ''),
						title: targetInfo.title || '',
						status: targetInfo.status || ''
					};
				}
			}
			
			return {
				...item,
				targetInfo,
				reporterInfo
			};
		}));
		
		return success("Fetched reports.", {
			data: populatedItems,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			}
		});
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

exports.getReportById = async (reportId) => {
	try {
		if (!reportId) return error("reportId is required", 400);
		const report = await ReportModel.getReportById(reportId);
		if (!report) return error("Report not found", 404);
		
		// Normalize TargetType for comparison
		const normalizedTargetType = report.TargetType === "post" ? "Post" : report.TargetType;
		
		// For posts, extract original post ID from Description if available
		let targetId = report.TargetId;
		let originalTargetId = null;
		
		if (normalizedTargetType === "Post") {
			const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(String(report.TargetId).trim());
			if (isValidObjectId) {
				// TargetId is already ObjectId (backward compatibility)
				originalTargetId = String(report.TargetId).trim();
			} else {
				// TargetId is GUID, try to get originalPostId from Description
				const isGuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(report.TargetId).trim());
				if (isGuidFormat) {
					// Try to parse Description as JSON
					if (report.Description && report.Description.trim()) {
						try {
							const desc = JSON.parse(report.Description);
							// Check if originalPostId exists and is not empty
							if (desc && typeof desc === "object" && desc.originalPostId && String(desc.originalPostId).trim()) {
								originalTargetId = String(desc.originalPostId).trim();
						}
					} catch {
						// Description is not valid JSON - this is a legacy report
					}
				}
				}
			}
		}
		
		// Populate target and reporter info (use originalTargetId for posts if available)
		const targetInfo = await populateTargetInfo(normalizedTargetType, originalTargetId || targetId);
		const reporterInfo = await populateReporterInfo(report.ReporterId);
		
		// Get history reports for same target
		const historyReports = await ReportModel.getReportsByTarget(normalizedTargetType, report.TargetId);
		
		// Parse Description to extract userDesc and originalPostId
		let userDesc = report.Description || "";
		let rawDescription = report.Description || ""; // Keep raw for frontend to parse
		
		// For Post reports, try to parse Description as JSON to extract userDesc
		if (normalizedTargetType === "Post" && report.Description) {
			try {
				const desc = JSON.parse(report.Description);
				// If parsed successfully and has userDesc, use it
				if (desc && typeof desc === "object" && desc.userDesc !== undefined) {
					userDesc = desc.userDesc || "";
				}
			} catch {
				// Description is not JSON, keep as is (legacy report)
			}
		}
		
		// Check if this is a legacy report (Post type with GUID but no originalPostId)
		const isLegacyPostReport = normalizedTargetType === "Post" && 
			!originalTargetId && 
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(targetId).trim());
		
		return success("Fetched report detail.", {
			...report,
			Description: userDesc, // Return only userDesc for display
			rawDescription: rawDescription, // Return raw Description for parsing originalPostId
			targetInfo,
			reporterInfo,
			historyReports: historyReports.filter(r => r.ReportId !== report.ReportId),
			originalTargetId: originalTargetId || targetId, // Include original post ID for frontend
			isLegacyPostReport: isLegacyPostReport || false, // Flag to indicate legacy report
			hasValidPostId: normalizedTargetType === "Post" ? !!originalTargetId : null // Flag for frontend validation
		});
	} catch (err) {
		return error("Error fetching report detail: " + err.message, 500);
	}
};

// Handle admin actions
exports.handleReportAction = async (reportId, action, adminNote, adminAccountId) => {
	try {
		const report = await ReportModel.getReportById(reportId);
		if (!report) return error("Report not found", 404);
		
		const { TargetType, TargetId } = report;
		let actionTaken = null;
		let newStatus = report.Status;
		
		// Normalize TargetType for comparison
		const normalizedTargetType = TargetType === "post" ? "Post" : TargetType;
		
		if (action === "delete_post" && normalizedTargetType === "Post") {
			// Delete post by changing status to "deleted" (admin can delete any post)
			try {
				const Post = require("../models/postModel");
				// Get original post ID (TargetId might be GUID)
				let postId = TargetId;
				const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(String(TargetId).trim());
				if (!isValidObjectId) {
					// TargetId is GUID, get original post ID from Description
					try {
						const desc = JSON.parse(report.Description || "{}");
						if (desc.originalPostId) {
							postId = desc.originalPostId;
						} else {
							return error("Cannot delete post: Post ID is GUID format and originalPostId not found.", 400);
						}
					} catch {
						return error("Cannot delete post: Post ID is GUID format and Description is not valid JSON.", 400);
					}
				}
				const post = await Post.findById(postId);
				if (!post) {
					return error("Post not found", 404);
				}
				// Change post status to "deleted" instead of physically deleting
				post.status = "deleted";
				await post.save();
				actionTaken = "delete_post";
				newStatus = "Resolve"; // Status theo schema: Pending, Review, Resolve
			} catch (err) {
				return error("Failed to delete post: " + err.message, 500);
			}
		} else if (action === "ban_account" && ["Account", "BarPages", "BusinessAccount"].includes(normalizedTargetType)) {
			// Ban account
			const result = await accountBanService.banEntity(normalizedTargetType, TargetId);
			if (!result.success) {
				return error("Failed to ban account: " + result.message, 500);
			}
			actionTaken = "ban_account";
			newStatus = "Resolve"; // Status theo schema: Pending, Review, Resolve
		} else if (action === "resolve") {
			newStatus = "Resolve"; // Status theo schema: Pending, Review, Resolve
			actionTaken = "resolve";
		} else if (action === "review") {
			newStatus = "Review"; // Chuyển sang trạng thái Review
			actionTaken = "review";
		} else {
			return error("Invalid action or target type", 400);
		}
		
		// Update report status (Description remains unchanged - it's user's description)
		const affected = await ReportModel.updateReportStatus(reportId, newStatus);
		if (affected === 0) return error("Report not found.", 404);
		
		return success("Action executed successfully.", { status: newStatus, actionTaken });
	} catch (err) {
		return error("Error executing action: " + err.message, 500);
	}
};