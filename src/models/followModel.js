
const { getPool, sql } = require("../db/sqlserver");

class FollowModel {
	static async followEntity({ followerId, followingId, followingType }) {
		const pool = await getPool();
		try {
			await pool.request()
				.input("followerId", sql.UniqueIdentifier, followerId)
				.input("followingId", sql.UniqueIdentifier, followingId)
				.input("followingType", sql.NVarChar, followingType)
				.query(`INSERT INTO Follows (FollowerId, FollowingId, FollowingType) VALUES (@followerId, @followingId, @followingType)`);
			return true;
		} catch (err) {
			throw err;
		}
	}

	static async unfollowEntity({ followerId, followingId }) {
		const pool = await getPool();
		const result = await pool.request()
			.input("followerId", sql.UniqueIdentifier, followerId)
			.input("followingId", sql.UniqueIdentifier, followingId)
			.query(`DELETE FROM Follows WHERE FollowerId = @followerId AND FollowingId = @followingId`);
		return result.rowsAffected[0];
	}

	static async getFollowers(entityAccountId, currentAccountId = null) {
		const pool = await getPool();
		
		// Get current user's EntityAccountId if currentAccountId is provided
		let currentEntityAccountId = null;
		if (currentAccountId) {
			const currentUserResult = await pool.request()
				.input("accountId", sql.UniqueIdentifier, currentAccountId)
				.query(`SELECT TOP 1 EntityAccountId FROM EntityAccounts WHERE AccountId = @accountId`);
			if (currentUserResult.recordset.length > 0) {
				currentEntityAccountId = currentUserResult.recordset[0].EntityAccountId;
			}
		}
		
		const result = await pool.request()
			.input("entityAccountId", sql.UniqueIdentifier, entityAccountId)
			.input("currentAccountId", sql.UniqueIdentifier, currentAccountId)
			.input("currentEntityAccountId", sql.UniqueIdentifier, currentEntityAccountId)
			.query(`
				SELECT 
					F.*,
					ea.EntityAccountId AS EntityAccountId,
					ea.EntityType      AS EntityType,
					ea.EntityId        AS EntityId,
					ea.AccountId       AS AccountId,
					COALESCE(a.UserName, ba.UserName, bp.BarName) AS UserName,
					COALESCE(a.Avatar,  ba.Avatar,  bp.Avatar)    AS Avatar,
					COALESCE(a.Role,    ba.Role,    bp.Role)      AS Role,
					CASE 
						WHEN @currentEntityAccountId IS NOT NULL AND EXISTS (
							SELECT 1 FROM Follows 
							WHERE FollowerId = @currentEntityAccountId 
							AND FollowingId = ea.EntityAccountId
						) THEN 1
						ELSE 0
					END AS IsFollowingByViewer
				FROM Follows F
				LEFT JOIN EntityAccounts ea 
					ON ea.EntityAccountId = F.FollowerId
				LEFT JOIN Accounts a 
					ON ea.EntityType = 'Account' AND ea.EntityId = a.AccountId
				LEFT JOIN BussinessAccounts ba
					ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
				LEFT JOIN BarPages bp
					ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
				WHERE F.FollowingId = @entityAccountId
				ORDER BY 
					CASE 
						WHEN @currentAccountId IS NOT NULL AND ea.AccountId = @currentAccountId THEN 0 
						ELSE 1 
					END,
					F.CreatedAt DESC
			`);
		return result.recordset;
	}

	static async getFollowing(entityAccountId, currentAccountId = null) {
		const pool = await getPool();
		const result = await pool.request()
			.input("entityAccountId", sql.UniqueIdentifier, entityAccountId)
			.input("currentAccountId", sql.UniqueIdentifier, currentAccountId)
			.query(`
				SELECT 
					F.*,
					ea.EntityAccountId AS EntityAccountId,
					ea.EntityType      AS EntityType,
					ea.EntityId        AS EntityId,
					ea.AccountId       AS AccountId,
					COALESCE(a.UserName, ba.UserName, bp.BarName) AS UserName,
					COALESCE(a.Avatar,  ba.Avatar,  bp.Avatar)    AS Avatar,
					COALESCE(a.Role,    ba.Role,    bp.Role)      AS Role
				FROM Follows F
				LEFT JOIN EntityAccounts ea 
					ON ea.EntityAccountId = F.FollowingId
				LEFT JOIN Accounts a 
					ON ea.EntityType = 'Account' AND ea.EntityId = a.AccountId
				LEFT JOIN BussinessAccounts ba
					ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
				LEFT JOIN BarPages bp
					ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
				WHERE F.FollowerId = @entityAccountId
				ORDER BY 
					CASE 
						WHEN @currentAccountId IS NOT NULL AND ea.AccountId = @currentAccountId THEN 0 
						ELSE 1 
					END,
					F.CreatedAt DESC
			`);
		return result.recordset;
	}

	static async checkFollowing({ followerId, followingId }) {
		const pool = await getPool();
		const result = await pool.request()
			.input("followerId", sql.UniqueIdentifier, followerId)
			.input("followingId", sql.UniqueIdentifier, followingId)
			.query(`SELECT * FROM Follows WHERE FollowerId = @followerId AND FollowingId = @followingId`);
		return result.recordset.length > 0;
	}
}

module.exports = FollowModel;
