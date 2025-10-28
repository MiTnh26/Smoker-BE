const Post = require("../models/postModel");
// const mongoose = require("mongoose");

class StoryService {
    async getStories(page = 1, limit = 10) {
        try {
            const skip = (page - 1) * limit;
            const now = new Date();
            const stories = await Post.find({
                type: "story",
                expiredAt: { $gt: now }
            })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const total = await Post.countDocuments({
                type: "story",
                expiredAt: { $gt: now }
            });

            return {
                success: true,
                data: stories,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            return {
                success: false,
                message: "Error fetching stories",
                error: error.message
            };
        }
    }
}

module.exports = new StoryService();