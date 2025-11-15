/*
  Migration: Move embedded post.medias (Map) to medias collection and fill post.mediaIds
  Run manually: node src/scripts/migrate_posts_medias.js
*/
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../db/mongodb");
const Post = require("../models/postModel");
const Media = require("../models/mediaModel");

(async () => {
  try {
    await connectDB();
    console.log("Connected to MongoDB");
    const cursor = Post.find({}).cursor();
    let migrated = 0;
    for (let post = await cursor.next(); post != null; post = await cursor.next()) {
      const updates = {};
      const mediaIds = [];
      const hasEmbedded = post.medias && (post.medias instanceof Map ? post.medias.size > 0 : Object.keys(post.medias || {}).length > 0);
      if (hasEmbedded) {
        const entries = post.medias instanceof Map ? Array.from(post.medias.values()) : Object.values(post.medias);
        for (const m of entries) {
          if (!m || !m.url) continue;
          const existing = await Media.findOne({ postId: post._id, url: m.url });
          if (existing) {
            mediaIds.push(existing._id);
            continue;
          }
          const mediaDoc = new Media({
            postId: post._id,
            accountId: post.accountId,
            url: m.url,
            caption: m.caption || "",
            comments: new Map(),
            likes: new Map()
          });
          await mediaDoc.save();
          mediaIds.push(mediaDoc._id);
        }
        updates.mediaIds = mediaIds;
        updates.$unset = { medias: 1 };
      }
      if (Object.keys(updates).length > 0) {
        await Post.updateOne({ _id: post._id }, updates);
        migrated++;
        console.log("Migrated post", post._id.toString(), "mediaIds:", mediaIds.length);
      }
    }
    console.log("Migration finished. Migrated posts:", migrated);
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
})();


