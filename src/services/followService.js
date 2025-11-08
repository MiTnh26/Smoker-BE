const { success, error } = require("../utils/response");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const FollowModel = require("../models/followModel");

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