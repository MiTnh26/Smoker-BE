const { getPool, sql } = require("../db/sqlserver");

class ReportModel {
	static async createReport(data) {
		const pool = await getPool();
		const request = pool.request();
		request.input("ReporterId", sql.UniqueIdentifier, data.ReporterId);
		request.input("ReporterRole", sql.NVarChar, data.ReporterRole);
		request.input("TargetType", sql.NVarChar, data.TargetType);
		request.input("TargetId", sql.UniqueIdentifier, data.TargetId);
		request.input("TargetOwnerId", sql.UniqueIdentifier, data.TargetOwnerId || null);
		request.input("Reason", sql.NVarChar, data.Reason);
		request.input("Description", sql.NVarChar, data.Description || null);
		request.input("Status", sql.NVarChar, data.Status || "Pending");
		const result = await request.query(`
			INSERT INTO Reports (ReporterId, ReporterRole, TargetType, TargetId, TargetOwnerId, Reason, Description, Status)
			OUTPUT INSERTED.*
			VALUES (@ReporterId, @ReporterRole, @TargetType, @TargetId, @TargetOwnerId, @Reason, @Description, @Status)
		`);
		return result.recordset[0];
	}

	static async getAllReports() {
		const pool = await getPool();
		const result = await pool.request().query("SELECT * FROM Reports ORDER BY CreatedAt DESC");
		return result.recordset;
	}

	static async getReportsByTarget(targetType, targetId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("targetType", sql.NVarChar, targetType)
			.input("targetId", sql.UniqueIdentifier, targetId)
			.query("SELECT * FROM Reports WHERE TargetType = @targetType AND TargetId = @targetId ORDER BY CreatedAt DESC");
		return result.recordset;
	}

	static async updateReportStatus(reportId, status) {
		const pool = await getPool();
		const result = await pool.request()
			.input("reportId", sql.UniqueIdentifier, reportId)
			.input("status", sql.NVarChar, status)
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