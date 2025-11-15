
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

	static async getFollowers(entityId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("entityId", sql.UniqueIdentifier, entityId)
			.query(`SELECT F.* FROM Follows F WHERE F.FollowingId = @entityId`);
		return result.recordset;
	}

	static async getFollowing(entityId) {
		const pool = await getPool();
		const result = await pool.request()
			.input("entityId", sql.UniqueIdentifier, entityId)
			.query(`SELECT F.* FROM Follows F WHERE F.FollowerId = @entityId`);
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
