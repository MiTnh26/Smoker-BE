const Song = require("../models/songModel.js");
const fs = require("fs");
const path = require("path");
const mongodb = require("mongodb");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");
const { trimAudio } = require("../utils/audioTrimmer");

// Utility function to sanitize filename and prevent encoding issues
const sanitizeFilename = (filename) => {
  if (!filename) return 'song.mp3';
  const ext = path.extname(filename) || '.mp3';
  const nameWithoutExt = path.basename(filename, ext);
  let sanitized = nameWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!sanitized || sanitized.length === 0) sanitized = 'song';
  if (sanitized.length > 200) sanitized = sanitized.substring(0, 200);
  return sanitized + ext;
};

// @desc    Add a new song
// @route   POST /api/song/upload
// @access  Private (Admin)
const addSong = async (req, res) => {
  try {
    const { title, artist, album, description, authorEntityId, authorEntityType, entityAccountId } = req.body;
    if (!title || !artist) {
      res.status(400);
      throw new Error("Please add title and artist");
    }
    if (!req.file) {
      res.status(400);
      throw new Error("No file uploaded");
    }

    const authorId = req.user?.id || null;

    let songEntityAccountId = entityAccountId;
    let songEntityId = authorEntityId;
    let songEntityType = authorEntityType;

    if (!songEntityAccountId && authorId) {
      try {
        songEntityAccountId = await getEntityAccountIdByAccountId(authorId);
        if (songEntityAccountId && !songEntityId) {
          songEntityId = String(authorId);
          songEntityType = "Account";
        }
      } catch (err) {
        console.warn("[SONG] Could not get EntityAccountId:", err);
      }
    }

    if (!songEntityAccountId && songEntityId && songEntityType) {
      try {
        const pool = await getPool();
        const normalizedEntityType = songEntityType === "Business" ? "BusinessAccount" :
                         songEntityType === "Bar" || songEntityType === "BarPage" ? "BarPage" : "Account";
        songEntityType = normalizedEntityType;

        const result = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, authorId)
          .input("EntityType", sql.NVarChar, normalizedEntityType)
          .input("EntityId", sql.UniqueIdentifier, songEntityId)
          .query(`SELECT TOP 1 EntityAccountId FROM EntityAccounts 
                  WHERE AccountId = @AccountId AND EntityType = @EntityType AND EntityId = @EntityId`);
        if (result.recordset.length > 0) {
          songEntityAccountId = String(result.recordset[0].EntityAccountId);
        }
      } catch (err) {
        console.warn("[SONG] Could not get EntityAccountId from authorEntityId:", err);
      }
    }

    const audioStartOffset = parseFloat(req.body?.audioStartOffset) || 0;
    const audioDuration = parseFloat(req.body?.audioDuration) || null;

    try {
      const sanitizedOriginalName = sanitizeFilename(req.file.originalname);
      let finalBuffer = req.file.buffer;
      let finalFilename = sanitizedOriginalName;

      const baseExt = path.extname(sanitizedOriginalName) || '.mp3';
      const baseName = path.basename(sanitizedOriginalName, baseExt);
      const ts = Date.now();
      if (audioStartOffset > 0 || audioDuration) {
        try {
          finalBuffer = await trimAudio(req.file.buffer, audioStartOffset, audioDuration, baseExt);
          finalFilename = `${baseName}_${ts}_trimmed.mp3`;
        } catch (trimError) {
          console.error("[SONG] Error trimming audio, using original file:", trimError);
          finalBuffer = req.file.buffer;
          finalFilename = `${baseName}_${ts}${baseExt}`;
        }
      } else {
        // Not trimmed, still ensure unique filename to avoid GridFS name conflicts
        finalFilename = `${baseName}_${ts}${baseExt}`;
      }

      const mongoose = require("mongoose");
      const db = mongoose.connection.db;
      const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
      const contentType = finalFilename.endsWith('_trimmed.mp3') ? 'audio/mpeg' : req.file.mimetype;
      const stream = bucket.openUploadStream(finalFilename, { contentType });
      stream.end(finalBuffer);

      stream.on("finish", async () => {
        const newSong = new Song({
          title,
          artistName: artist,
          album: album || "",
          description: description || "",
          accountId: authorId,
          entityAccountId: songEntityAccountId,
          entityId: songEntityId,
          entityType: songEntityType,
          song: stream.filename,
          file: stream.id,
          audioStartOffset: 0,
          audioDuration: audioDuration || null,
        });
        await newSong.save();
        res.status(201).json({ status: "success", message: "Song added successfully", data: newSong });
      });

      stream.on("error", (err) => {
        console.log(err);
        res.status(500).json({ error: "Error uploading file to GridFS" });
      });
    } catch (error) {
      console.error("[SONG] Error processing audio:", error);
      res.status(500).json({ error: error.message || "Error processing audio file" });
    }
  } catch (error) {
    console.log(error);
    return res.json({ error: error.message });
  }
};

//@desc   Delete a song
//@route  DELETE /api/song/delete/:id
//@access Private (Admin)
const deleteSong = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400);
      throw new Error("Thiếu id bài hát");
    }

    const song = await Song.findById(id);
    if (!song) {
      res.status(404);
      throw new Error("Không tìm thấy bài hát");
    }

    await Song.findByIdAndDelete(id);

    if (req.query.file) {
      try {
        const mongoose = require("mongoose");
        const db = mongoose.connection.db;
        const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
        await bucket.delete(new mongodb.ObjectId(req.query.file));
      } catch (err) {
        console.log("Lỗi khi xóa file GridFS:", err.message);
      }
    }

    res.status(200).json({ message: "Đã xóa bài hát thành công", status: "success" });
  } catch (error) {
    console.log(error);
    return res.json({ error: error.message, status: "error" });
  }
};

// @desc    Get all songs
// @route   GET /api/song/
// @access  Public
const getSongs = async (req, res) => {
  try {
    const songs = await Song.find({});
    res.status(200).json({ songs });
  } catch (error) {
    console.log(error);
    return res.json({ error: error.message, status: "error" });
  }
};

// @desc: Stream a song by filename
// @route : GET /api/song/stream/:filename
// @access  Public
const streamSong = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename) {
      return res.status(400).json({ status: "error", error: "No file name provided" });
    }
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });

    // Find file to get length for range
    const files = await bucket.find({ filename }).toArray();
    if (!files || !files[0]) {
      return res.status(404).json({ status: "error", error: "File not found" });
    }
    const file = files[0];
    const fileSize = file.length;
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": file.contentType || "audio/mpeg",
      });
      const downloadStream = bucket.openDownloadStreamByName(filename, { start, end: end + 1 });
      downloadStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": file.contentType || "audio/mpeg",
      });
      const downloadStream = bucket.openDownloadStreamByName(filename);
      downloadStream.pipe(res);
    }
  } catch (error) {
    console.log(error.message);
    return res.json({ error: error.message, status: "error" });
  }
};

// @desc: Stream a song by GridFS file id (ObjectId)
// @route : GET /api/song/stream-id/:fileId
// @access  Public
const streamSongById = async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).json({ status: "error", error: "No file id provided" });
    }
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });

    try {
      const files = await bucket.find({ _id: new mongodb.ObjectId(fileId) }).toArray();
      if (files && files[0] && files[0].contentType) {
        res.setHeader("Content-Type", files[0].contentType);
      } else {
        res.setHeader("Content-Type", "audio/mpeg");
      }
    } catch (metaErr) {
      res.setHeader("Content-Type", "audio/mpeg");
    }

    const downloadStream = bucket
      .openDownloadStream(new mongodb.ObjectId(fileId))
      .on("error", (error) => {
        console.error("GridFS stream error:", error);
        res.status(404).json({ status: "error", error: "File not found" });
      })
      .on("end", () => res.end());

    downloadStream.pipe(res);
  } catch (error) {
    console.error(error.message);
    return res.json({ error: error.message, status: "error" });
  }
};

module.exports = {
  addSong,
  deleteSong,
  getSongs,
  streamSong,
  streamSongById,
};
