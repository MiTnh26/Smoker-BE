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
                .populate({ path: "songId", select: "song" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Post.countDocuments({
                type: "story",
                expiredAt: { $gt: now }
            });

            // Đưa songFilename ra ngoài cho tiện FE dùng
            const storiesWithSong = stories.map(story => ({
                ...story,
                songFilename: story.songId && story.songId.song ? story.songId.song : null
            }));

            return {
                success: true,
                data: storiesWithSong,
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