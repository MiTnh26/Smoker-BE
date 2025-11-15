
const followService = require("../services/followService");


// Follow an entity
exports.followEntity = async (req, res) => {
    const { followerId, followingId, followingType } = req.body;
    if (!followerId || !followingId || !followingType) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    const result = await followService.followEntity({ followerId, followingId, followingType });
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.status(201).json(result);
};


// Unfollow an entity
exports.unfollowEntity = async (req, res) => {
    const { followerId, followingId } = req.body;
    if (!followerId || !followingId) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    const result = await followService.unfollowEntity({ followerId, followingId });
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
    const result = await followService.checkFollowing({ followerId, followingId });
    if (result.status === "error") {
        return res.status(result.code || 500).json(result);
    }
    res.json(result);
};
