const { success, error } = require("../utils/response");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const FollowModel = require("../models/followModel");
const notificationService = require("./notificationService");
const { getPool, sql } = require("../db/sqlserver");

exports.followEntity = async ({ followerId, followingId, followingType }) => {
	try {
		// Nếu followerId/followingId là accountId (UUID user), lấy EntityAccountId
		let followerEntityAccountId = await getEntityAccountIdByAccountId(followerId) || followerId;
		let followingEntityAccountId = await getEntityAccountIdByAccountId(followingId) || followingId;
	// Prevent self-follow
	if (followerEntityAccountId === followingEntityAccountId) {
		return error("Cannot follow yourself.", 400);
	}
		console.log("Resolved followerEntityAccountId:", followerEntityAccountId);
		console.log("Resolved followingEntityAccountId:", followingEntityAccountId);
		await FollowModel.followEntity({ followerId: followerEntityAccountId, followingId: followingEntityAccountId, followingType });
		
		// Tạo notification cho người được follow (không gửi nếu follow chính mình - đã check ở trên)
		try {
			// Lấy sender và receiver accountIds cho backward compatibility
			const senderAccountId = followerId;
			const receiverAccountId = followingId;
			
			// Lấy entity info từ SQL Server
			let senderEntityId = null;
			let senderEntityType = null;
			let receiverEntityId = null;
			let receiverEntityType = null;
			
			// Get sender entity info
			if (followerEntityAccountId) {
				try {
					const pool = await getPool();
					const result = await pool.request()
						.input("EntityAccountId", sql.UniqueIdentifier, followerEntityAccountId)
						.query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
					if (result.recordset.length > 0) {
						senderEntityType = result.recordset[0].EntityType;
						senderEntityId = String(result.recordset[0].EntityId);
					}
				} catch (err) {
					console.warn("[FollowService] Could not get sender entity info:", err);
				}
			}
			
			// Get receiver entity info
			if (followingEntityAccountId) {
				try {
					const pool = await getPool();
					const result = await pool.request()
						.input("EntityAccountId", sql.UniqueIdentifier, followingEntityAccountId)
						.query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
					if (result.recordset.length > 0) {
						receiverEntityType = result.recordset[0].EntityType;
						receiverEntityId = String(result.recordset[0].EntityId);
					}
				} catch (err) {
					console.warn("[FollowService] Could not get receiver entity info:", err);
				}
			}
			
			await notificationService.createFollowNotification({
				sender: senderAccountId,
				senderEntityAccountId: String(followerEntityAccountId),
				senderEntityId: senderEntityId,
				senderEntityType: senderEntityType,
				receiver: receiverAccountId,
				receiverEntityAccountId: String(followingEntityAccountId),
				receiverEntityId: receiverEntityId,
				receiverEntityType: receiverEntityType
			});
		} catch (notifError) {
			// Log error but don't fail the follow operation
			console.error("[FollowService] Error creating follow notification:", notifError);
		}
		
		return success("Followed successfully.");
	} catch (err) {
		if (err.message && err.message.includes("UQ_Follow")) {
			return error("Already following.", 409);
		}
		return error("Error following entity: " + err.message, 500);
	}
};

exports.unfollowEntity = async ({ followerId, followingId }) => {
	try {
		let followerEntityAccountId = await getEntityAccountIdByAccountId(followerId) || followerId;
		let followingEntityAccountId = await getEntityAccountIdByAccountId(followingId) || followingId;
		const affected = await FollowModel.unfollowEntity({ followerId: followerEntityAccountId, followingId: followingEntityAccountId });
		if (affected === 0) {
			return error("Follow relationship not found.", 404);
		}
		return success("Unfollowed successfully.");
	} catch (err) {
		return error("Error unfollowing entity: " + err.message, 500);
	}
};

exports.getFollowers = async (entityId) => {
	try {
        const entityAccountId = await getEntityAccountIdByAccountId(entityId) || entityId;
        const followers = await FollowModel.getFollowers(entityAccountId);
		return success("Fetched followers.", followers);
	} catch (err) {
		return error("Error fetching followers: " + err.message, 500);
	}
};

exports.getFollowing = async (entityId) => {
	try {
        const entityAccountId = await getEntityAccountIdByAccountId(entityId) || entityId;
        const following = await FollowModel.getFollowing(entityAccountId);
		return success("Fetched following list.", following);
	} catch (err) {
		return error("Error fetching following list: " + err.message, 500);
	}
};

exports.checkFollowing = async ({ followerId, followingId }) => {
	try {
		let followerEntityAccountId = await getEntityAccountIdByAccountId(followerId) || followerId;
		let followingEntityAccountId = await getEntityAccountIdByAccountId(followingId) || followingId;
		const isFollowing = await FollowModel.checkFollowing({ followerId: followerEntityAccountId, followingId: followingEntityAccountId });
		return success("Checked follow status.", { isFollowing });
	} catch (err) {
		return error("Error checking follow status: " + err.message, 500);
	}
};