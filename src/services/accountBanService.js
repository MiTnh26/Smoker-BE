const { getPool, sql } = require("../db/sqlserver");
const { success, error } = require("../utils/response");
const { verifyEntityAccountId } = require("../models/entityAccountModel");

/**
 * Ban an account/barpage/businessaccount by setting Status = 'Banned'
 * targetId can be EntityAccountId or direct EntityId
 */
async function banEntity(targetType, targetId) {
	try {
		const pool = await getPool();
		let entityId = targetId;
		
		// Check if targetId is EntityAccountId, if so get EntityId
		const entityInfo = await verifyEntityAccountId(targetId);
		if (entityInfo && entityInfo.EntityType === targetType) {
			entityId = entityInfo.EntityId;
		}
		
		let updateQuery = "";
		
		if (targetType === "Account") {
			updateQuery = `
				UPDATE Accounts 
				SET Status = 'Banned'
				WHERE AccountId = @entityId
			`;
		} else if (targetType === "BarPage") {
			updateQuery = `
				UPDATE BarPages 
				SET Status = 'Banned'
				WHERE BarPageId = @entityId
			`;
		} else if (targetType === "BusinessAccount") {
			updateQuery = `
				UPDATE BussinessAccounts 
				SET Status = 'Banned'
				WHERE BussinessAccountId = @entityId
			`;
		} else {
			return { success: false, message: "Invalid targetType. Must be Account, BarPage, or BusinessAccount" };
		}
		
		const result = await pool.request()
			.input("entityId", sql.UniqueIdentifier, entityId)
			.query(updateQuery);
		
		if (result.rowsAffected[0] === 0) {
			return { success: false, message: `${targetType} not found (ID: ${entityId})` };
		}
		
		return { success: true, message: `${targetType} banned successfully` };
	} catch (err) {
		console.error("[accountBanService] Error:", err);
		return { success: false, message: "Error banning account: " + err.message };
	}
}

module.exports = { banEntity };

