const { getPool, sql } = require("../db/sqlserver");

class ReportModel {
	static async createReport(data) {
		const pool = await getPool();
		const request = pool.request();
		request.input("ReporterId", sql.UniqueIdentifier, data.ReporterId || null);
		request.input("ReporterRole", sql.NVarChar(50), data.ReporterRole);
		request.input("TargetType", sql.NVarChar(50), data.TargetType);
		request.input("TargetId", sql.UniqueIdentifier, data.TargetId || null);
		request.input("TargetOwnerId", sql.UniqueIdentifier, data.TargetOwnerId || null);
		request.input("Reason", sql.NVarChar(250), data.Reason);
		request.input("Description", sql.NVarChar(500), data.Description || null);
		request.input("Status", sql.NVarChar(50), data.Status || "Pending");
		const result = await request.query(`
			INSERT INTO Reports (ReporterId, ReporterRole, TargetType, TargetId, TargetOwnerId, Reason, Description, Status)
			OUTPUT INSERTED.*
			VALUES (@ReporterId, @ReporterRole, @TargetType, @TargetId, @TargetOwnerId, @Reason, @Description, @Status)
		`);
		return result.recordset[0];
	}

	static async getReports(filters = {}, pagination = {}) {
		const {
			status,
			targetType,
			reporterId,
			search,
			page = 1,
			limit = 20,
		} = filters;

		const offset = (page - 1) * limit;
		const pool = await getPool();
		const request = pool.request();

		let where = "1=1";

		if (status) {
			where += " AND Status = @status";
			request.input("status", sql.NVarChar(50), status);
		}

		if (targetType) {
			where += " AND TargetType = @targetType";
			request.input("targetType", sql.NVarChar(50), targetType);
		}

		if (reporterId) {
			where += " AND ReporterId = @reporterId";
			request.input("reporterId", sql.UniqueIdentifier, reporterId);
		}

		if (search) {
			where += " AND (Reason LIKE @search OR Description LIKE @search)";
			request.input("search", sql.NVarChar, `%${search}%`);
		}

		const query = `
			SELECT *
			FROM Reports
			WHERE ${where}
			ORDER BY CreatedAt DESC
			OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
		`;

		request.input("offset", sql.Int, offset);
		request.input("limit", sql.Int, limit);

		const result = await request.query(query);

		// Count total
		const countReq = pool.request();
		if (status) countReq.input("status", sql.NVarChar(50), status);
		if (targetType) countReq.input("targetType", sql.NVarChar(50), targetType);
		if (reporterId) countReq.input("reporterId", sql.UniqueIdentifier, reporterId);
		if (search) countReq.input("search", sql.NVarChar, `%${search}%`);

		const countQuery = `SELECT COUNT(*) as total FROM Reports WHERE ${where};`;
		const countRes = await countReq.query(countQuery);
		const total = countRes.recordset[0]?.total || 0;

		return { items: result.recordset, total };
	}

	static async getReportById(reportId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("reportId", sql.UniqueIdentifier, reportId)
			.query("SELECT * FROM Reports WHERE ReportId = @reportId");
		return result.recordset?.[0] || null;
	}

	static async getReportsByTarget(targetType, targetId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("targetType", sql.NVarChar(50), targetType)
			.input("targetId", sql.UniqueIdentifier, targetId)
			.query("SELECT * FROM Reports WHERE TargetType = @targetType AND TargetId = @targetId ORDER BY CreatedAt DESC");
		return result.recordset;
	}

	static async updateReportStatus(reportId, status) {
		const pool = await getPool();
		const result = await pool.request()
			.input("reportId", sql.UniqueIdentifier, reportId)
			.input("status", sql.NVarChar(50), status)
			.query("UPDATE Reports SET Status = @status, UpdatedAt = GETDATE() WHERE ReportId = @reportId");
		return result.rowsAffected[0];
	}

	static async getReportsByReporter(reporterId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("reporterId", sql.UniqueIdentifier, reporterId)
			.query("SELECT * FROM Reports WHERE ReporterId = @reporterId ORDER BY CreatedAt DESC");
		return result.recordset;
	}
}

module.exports = ReportModel;