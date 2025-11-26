
const followService = require("../services/followService");


// Follow an entity
exports.followEntity = async (req, res) => {
    const { followerId, followingId, followingType } = req.body;
    const userId = req.user?.id; // Get userId from token

    console.log("📥 Follow request:", { followerId, followingId, followingType, userId });
    if (!followerId || !followingId || !followingType) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }

    const result = await followService.followEntity({ followerId, followingId, followingType, userId });
    if (result.status === "error") {
        console.error("❌ Follow error:", result.message);
        return res.status(result.code || 500).json(result);
    }
    console.log("✅ Follow success");
    res.status(201).json(result);
};


// Unfollow an entity
exports.unfollowEntity = async (req, res) => {
    const { followerId, followingId } = req.body;
    const userId = req.user?.id; // Get userId from token

    if (!followerId || !followingId) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized.' });
    }

    const result = await followService.unfollowEntity({ followerId, followingId, userId });
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};


// Get followers of an entity
exports.getFollowers = async (req, res) => {
    const { entityId } = req.params;
    const result = await followService.getFollowers(entityId);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};


// Get following list of an entity
exports.getFollowing = async (req, res) => {
    const { entityId } = req.params;
    const result = await followService.getFollowing(entityId);
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};


// Check if following
exports.checkFollowing = async (req, res) => {
    const { followerId, followingId } = req.query;
    console.log("🔍 Check following:", { followerId, followingId });
    const result = await followService.checkFollowing({ followerId, followingId });
    if (result.status === "error") {
        console.error("❌ Check following error:", result.message);
        return res.status(result.code || 500).json(result);
    }
    console.log("✅ Check following result:", result.data?.isFollowing);
    res.json(result);
};
