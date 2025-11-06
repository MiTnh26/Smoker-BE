const Music = require("../models/musicModel");
const mongoose = require("mongoose");

// Helpers
const toObjectIdIfValid = (id) =>
  mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

const formatMusicResponse = (music) => music; // adjust if you want to pick fields

// Controller functions
exports.createMusic = async (req, res) => {
  try {
    // Expect frontend to send these fields (English names)
    const {
      title,
      artist,
      details = "",
      hashTag = "",
      purchaseLink = "",
      audioUrl,
      coverUrl,
      uploaderId,       // optional: provided by frontend/session
      uploaderName,
      uploaderAvatar
    } = req.body;

    // Basic validation
    if (!title || !artist || !audioUrl || !coverUrl) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, artist, audioUrl, coverUrl"
      });
    }

    const finalUploaderId = uploaderId || req.user?.id || null;

    const musicData = {
      title,
      artist,
      details,
      hashTag,
      purchaseLink,
      audioUrl,
      coverUrl,
      uploaderId: finalUploaderId ? toObjectIdIfValid(finalUploaderId) : undefined,
      uploaderName: uploaderName || req.user?.name || "",
      uploaderAvatar: uploaderAvatar || req.user?.avatar || ""
    };

    const music = await Music.create(musicData);

    return res.status(201).json({
      success: true,
      data: music,
      message: "Music created successfully"
    });
  } catch (err) {
    console.error("[MUSIC] createMusic error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
};

exports.getAllMusics = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, parseInt(req.query.limit || "10", 10));
    const skip = (page - 1) * limit;

    const musics = await Music.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Music.countDocuments();

    return res.status(200).json({
      success: true,
      data: musics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("[MUSIC] getAllMusics error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
};

exports.getMusicsByAuthor = async (req, res) => {
  try {
    const { authorId } = req.params;
    if (!authorId) {
      return res.status(400).json({ success: false, message: "authorId is required" });
    }

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, parseInt(req.query.limit || "10", 10));
    const skip = (page - 1) * limit;

    const orConditions = [{ uploaderId: authorId }, { authorEntityId: authorId }];

    // If authorId is an ObjectId, also include objectId match
    if (mongoose.Types.ObjectId.isValid(authorId)) {
      orConditions.push({ uploaderId: mongoose.Types.ObjectId(authorId) });
    }

    const query = { $or: orConditions };

    const musics = await Music.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Music.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: musics,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error("[MUSIC] getMusicsByAuthor error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
};

exports.likeMusic = async (req, res) => {
  try {
    const { musicId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!mongoose.Types.ObjectId.isValid(musicId)) {
      return res.status(400).json({ success: false, message: "Invalid musicId" });
    }

    const music = await Music.findById(musicId);
    if (!music) return res.status(404).json({ success: false, message: "Music not found" });

    // Check if user already liked (values of the Map may be ObjectId/string)
    const alreadyLiked = Array.from((music.likes || new Map()).values())
      .some(v => v && v.toString() === userId.toString());

    if (alreadyLiked) {
      return res.status(400).json({ success: false, message: "Already liked this music" });
    }

    const likeKey = new mongoose.Types.ObjectId().toString();
    // store userId as string (or ObjectId if you prefer)
    music.likes = music.likes || new Map();
    music.likes.set(likeKey, userId);
    await music.save();

    return res.status(200).json({ success: true, data: music, message: "Music liked successfully" });
  } catch (err) {
    console.error("[MUSIC] likeMusic error:", err);
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
};

exports.unlikeMusic = async (req, res) => {
  try {
    const { musicId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!mongoose.Types.ObjectId.isValid(musicId)) {
      return res.status(400).json({ success: false, message: "Invalid musicId" });
    }

    const music = await Music.findById(musicId);
    if (!music) return res.status(404).json({ success: false, message: "Music not found" });

    // Remove the like entry where value === userId
    if (music.likes) {
      for (const [key, val] of music.likes.entries()) {
        if (val && val.toString() === userId.toString()) {
          music.likes.delete(key);
          break;
        }
      }
    }

    await music.save();

    return res.status(200).json({ success: true, data: music, message: "Music unliked successfully" });
  } catch (err) {
    console.error("[MUSIC] unlikeMusic error:", err);
    return res.status(500).json({ success: false, message: "Internal server error", error: err.message });
  }
};
