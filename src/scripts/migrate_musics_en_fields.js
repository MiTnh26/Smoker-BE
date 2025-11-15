/*
  Migration: Convert musics fields from Vietnamese to English.
  Safe/backfillable: only sets EN fields if missing.
  Run: node src/scripts/migrate_musics_en_fields.js
*/
require("dotenv").config();
const connectDB = require("../db/mongodb");
const Music = require("../models/musicModel");

(async () => {
  try {
    await connectDB();
    let updated = 0;
    const cursor = Music.find({}).cursor();
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      const u = {};
      // If old VN fields exist on the document instance (pre-refactor data), copy them
      // Note: Access via doc.get to avoid key issues
      const titleVN = doc.get("Tên Bài Nhạc");
      const artistVN = doc.get("Tên Nghệ Sĩ");
      const coverUrlVN = doc.get("Ảnh Nền Bài Nhạc");
      const detailsVN = doc.get("Chi Tiết");
      const hashTagVN = doc.get("HashTag");
      const purchaseLinkVN = doc.get("Link Mua Nhạc");
      const uploaderIdVN = doc.get("Người Đăng");

      if (!doc.title && titleVN) u.title = titleVN;
      if (!doc.artist && artistVN) u.artist = artistVN;
      if (!doc.coverUrl && coverUrlVN) u.coverUrl = coverUrlVN;
      if (!doc.details && detailsVN) u.details = detailsVN;
      if (!doc.hashTag && hashTagVN) u.hashTag = hashTagVN;
      if (!doc.purchaseLink && purchaseLinkVN) u.purchaseLink = purchaseLinkVN;
      if (!doc.uploaderId && uploaderIdVN) u.uploaderId = uploaderIdVN;

      if (Object.keys(u).length > 0) {
        await Music.updateOne({ _id: doc._id }, { $set: u });
        updated++;
        console.log("Updated music", doc._id.toString());
      }
    }
    console.log("Music migration done. Updated:", updated);
    process.exit(0);
  } catch (err) {
    console.error("Music migration failed:", err);
    process.exit(1);
  }
})();


