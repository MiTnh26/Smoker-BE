const { success, error } = require("../utils/response");
const { normalizeToEntityAccountId, getAllEntityAccountIdsForAccount } = require("../models/entityAccountModel");
const FollowModel = require("../models/followModel");
const notificationService = require("./notificationService");
const { getPool, sql } = require("../db/sqlserver");

exports.followEntity = async ({ followerId, followingId, followingType, userId }) => {
	try {
		if (!followerId || !followingId || !userId) {
			return error("followerId, followingId, and userId are required.", 400);
		}

		// Get all EntityAccountIds for the logged-in user's AccountId (supports multi-role)
		const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(userId);
		if (allUserEntityAccountIds.length === 0) {
			return error("Could not verify follower's identity.", 401);
		}

		// Normalize IDs from request body
		const followerEntityAccountIdFromRequest = await normalizeToEntityAccountId(followerId);
		const followingEntityAccountId = await normalizeToEntityAccountId(followingId);

		// Security Validation: Ensure the followerId from the body belongs to the logged-in user
		// Check if followerEntityAccountIdFromRequest is in the list of all EntityAccountIds for this AccountId
		const followerEntityAccountIdNormalized = followerEntityAccountIdFromRequest?.toLowerCase().trim();
		const isAuthorized = followerEntityAccountIdNormalized && allUserEntityAccountIds.includes(followerEntityAccountIdNormalized);
		
		if (!isAuthorized) {
			console.warn("[FollowService] Mismatch: followerId from request body does not belong to user's AccountId.", {
				fromBody: followerEntityAccountIdFromRequest,
				userEntityAccountIds: allUserEntityAccountIds,
				userId
			});
			return error("Follower ID does not match the authenticated user.", 403); // 403 Forbidden
		}

		// Use the normalized EntityAccountId from request (which is the active role)
		const trustedFollowerEntityAccountId = followerEntityAccountIdFromRequest;

		if (!followingEntityAccountId) {
			console.error("❌ Failed to normalize followingId:", followingId);
			return error("Invalid followingId. Could not resolve to EntityAccountId.", 400);
		}

		// Prevent self-follow
		if (trustedFollowerEntityAccountId === followingEntityAccountId) {
			return error("Cannot follow yourself.", 400);
		}

		console.log("✅ Resolved followerEntityAccountId:", trustedFollowerEntityAccountId);
		console.log("✅ Resolved followingEntityAccountId:", followingEntityAccountId);
		await FollowModel.followEntity({ followerId: trustedFollowerEntityAccountId, followingId: followingEntityAccountId, followingType });
		
		// Tạo notification cho người được follow (không gửi nếu follow chính mình - đã check ở trên)
		try {
			const pool = await getPool();
			
			// Lấy entity info và AccountId từ SQL Server
			let senderAccountId = null;
			let senderEntityId = null;
			let senderEntityType = null;
			let receiverAccountId = null;
			let receiverEntityId = null;
			let receiverEntityType = null;
			
			// Get sender entity info và AccountId
			if (trustedFollowerEntityAccountId) {
				try {
					const result = await pool.request()
						.input("EntityAccountId", sql.UniqueIdentifier, trustedFollowerEntityAccountId)
						.query(`SELECT TOP 1 AccountId, EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
					if (result.recordset.length > 0) {
						senderAccountId = String(result.recordset[0].AccountId);
						senderEntityType = result.recordset[0].EntityType;
						senderEntityId = String(result.recordset[0].EntityId);
					}
				} catch (err) {
					console.warn("[FollowService] Could not get sender entity info:", err);
				}
			}
			
			// Get receiver entity info và AccountId
			if (followingEntityAccountId) {
				try {
					const result = await pool.request()
						.input("EntityAccountId", sql.UniqueIdentifier, followingEntityAccountId)
						.query(`SELECT TOP 1 AccountId, EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
					if (result.recordset.length > 0) {
						receiverAccountId = String(result.recordset[0].AccountId);
						receiverEntityType = result.recordset[0].EntityType;
						receiverEntityId = String(result.recordset[0].EntityId);
					}
				} catch (err) {
					console.warn("[FollowService] Could not get receiver entity info:", err);
				}
			}
			
			// BẮT BUỘC phải lấy được AccountId từ EntityAccountId
			// KHÔNG fallback về followerId/followingId để tránh nhầm lẫn
			if (!senderAccountId || !receiverAccountId) {
				console.error("[FollowService] Failed to get AccountId from EntityAccountId. senderAccountId:", senderAccountId, "receiverAccountId:", receiverAccountId);
				// Vẫn tạo notification nhưng không có AccountId (chỉ có EntityAccountId)
				// notificationService sẽ xử lý
			}
			
			await notificationService.createFollowNotification({
				sender: senderAccountId || null, // Optional - chỉ để backward compatibility
				senderEntityAccountId: String(trustedFollowerEntityAccountId), // REQUIRED
				senderEntityId: senderEntityId,
				senderEntityType: senderEntityType,
				receiver: receiverAccountId || null, // Optional - chỉ để backward compatibility
				receiverEntityAccountId: String(followingEntityAccountId), // REQUIRED
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

exports.unfollowEntity = async ({ followerId, followingId, userId }) => {
	try {
		if (!followerId || !followingId || !userId) {
			return error("followerId, followingId, and userId are required.", 400);
		}

		// Get all EntityAccountIds for the logged-in user's AccountId (supports multi-role)
		const allUserEntityAccountIds = await getAllEntityAccountIdsForAccount(userId);
		if (allUserEntityAccountIds.length === 0) {
			return error("Could not verify follower's identity.", 401);
		}

		// Normalize IDs from request body
		const followerEntityAccountIdFromRequest = await normalizeToEntityAccountId(followerId);
		const followingEntityAccountId = await normalizeToEntityAccountId(followingId);

		// Security Validation: Ensure the followerId from the body belongs to the logged-in user
		// Check if followerEntityAccountIdFromRequest is in the list of all EntityAccountIds for this AccountId
		const followerEntityAccountIdNormalized = followerEntityAccountIdFromRequest?.toLowerCase().trim();
		const isAuthorized = followerEntityAccountIdNormalized && allUserEntityAccountIds.includes(followerEntityAccountIdNormalized);
		
		if (!isAuthorized) {
			console.warn("[FollowService] Mismatch: followerId from request body does not belong to user's AccountId for unfollow.", {
				fromBody: followerEntityAccountIdFromRequest,
				userEntityAccountIds: allUserEntityAccountIds,
				userId
			});
			return error("Follower ID does not match the authenticated user.", 403); // 403 Forbidden
		}

		// Use the normalized EntityAccountId from request (which is the active role)
		const trustedFollowerEntityAccountId = followerEntityAccountIdFromRequest;

		if (!followingEntityAccountId) {
			console.error("❌ Failed to normalize followingId:", followingId);
			return error("Invalid followingId. Could not resolve to EntityAccountId.", 400);
		}

		const affected = await FollowModel.unfollowEntity({ followerId: trustedFollowerEntityAccountId, followingId: followingEntityAccountId });
		if (affected === 0) {
			return error("Follow relationship not found.", 404);
		}
		return success("Unfollowed successfully.");
	} catch (err) {
		return error("Error unfollowing entity: " + err.message, 500);
	}
};

/**
 * Get followers of an entity
 * @param {string} id - Any type of ID (EntityAccountId, EntityId, AccountId, BarPageId, BusinessAccountId)
 *                      Will be normalized to EntityAccountId internally
 * @returns {Promise<Object>} Success response with followers array
 */
exports.getFollowers = async (id) => {
	try {
		if (!id) {
			return error("id is required.", 400);
		}
		
		// Normalize ID to EntityAccountId (handles all entity types)
        const entityAccountId = await normalizeToEntityAccountId(id);
        if (!entityAccountId) {
			console.error("❌ Failed to normalize id:", id);
			return error("Invalid id. Could not resolve to EntityAccountId.", 400);
		}
        const followers = await FollowModel.getFollowers(entityAccountId);
		return success("Fetched followers.", followers);
	} catch (err) {
		return error("Error fetching followers: " + err.message, 500);
	}
};

/**
 * Get following list of an entity
 * @param {string} id - Any type of ID (EntityAccountId, EntityId, AccountId, BarPageId, BusinessAccountId)
 *                      Will be normalized to EntityAccountId internally
 * @returns {Promise<Object>} Success response with following array
 */
exports.getFollowing = async (id) => {
	try {
		if (!id) {
			return error("id is required.", 400);
		}
		
		// Normalize ID to EntityAccountId (handles all entity types)
        const entityAccountId = await normalizeToEntityAccountId(id);
        if (!entityAccountId) {
			console.error("❌ Failed to normalize id:", id);
			return error("Invalid id. Could not resolve to EntityAccountId.", 400);
		}
        const following = await FollowModel.getFollowing(entityAccountId);
		return success("Fetched following list.", following);
	} catch (err) {
		return error("Error fetching following list: " + err.message, 500);
	}
};

exports.checkFollowing = async ({ followerId, followingId }) => {
	try {
		if (!followerId || !followingId) {
			return success("Checked follow status.", { isFollowing: false });
		}
		
		// Normalize IDs to EntityAccountId (handles all entity types)
		let followerEntityAccountId = await normalizeToEntityAccountId(followerId);
		let followingEntityAccountId = await normalizeToEntityAccountId(followingId);
		
		// If normalization failed for either ID, return false (not following)
		// This prevents SQL errors when IDs are invalid or cannot be resolved
		if (!followerEntityAccountId || !followingEntityAccountId) {
			return success("Checked follow status.", { isFollowing: false });
		}
		
		const isFollowing = await FollowModel.checkFollowing({ 
			followerId: followerEntityAccountId, 
			followingId: followingEntityAccountId 
		});
		return success("Checked follow status.", { isFollowing });
	} catch (err) {
		// Return false instead of error to prevent frontend crashes
		// Log error for debugging
		console.error('❌ Error in checkFollowing:', err.message);
		return success("Checked follow status.", { isFollowing: false });
	}
};