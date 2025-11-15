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
  
  // Get extension first
  const ext = path.extname(filename) || '.mp3';
  const nameWithoutExt = path.basename(filename, ext);
  
  // Normalize Unicode characters (NFD to NFC) and remove diacritics if needed
  // Replace special characters with safe alternatives
  let sanitized = nameWithoutExt
    .normalize('NFD') // Decompose characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
    .replace(/[^a-zA-Z0-9\s\-_]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  
  // If sanitized name is empty, use a default
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'song';
  }
  
  // Limit length to avoid issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  return sanitized + ext;
};

// @desc    Add a new song
// @route   POST /api/song/upload
// @access  Private
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
    
    // Lấy thông tin user từ middleware (nếu có)
    const authorId = req.user?.id || null;
    
    // Lấy entityAccountId, entityId, entityType từ request body hoặc từ activeEntity
    let songEntityAccountId = entityAccountId;
    let songEntityId = authorEntityId;
    let songEntityType = authorEntityType;
    
    // Nếu chưa có entityAccountId, cố gắng lấy từ authorId
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
    
    // Nếu có authorEntityId và authorEntityType, tìm EntityAccountId tương ứng
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
    
    // Lấy thông tin trimming từ request body
    const audioStartOffset = parseFloat(req.body?.audioStartOffset) || 0;
    const audioDuration = parseFloat(req.body?.audioDuration) || null;
    
    try {
      // Sanitize filename first to prevent encoding issues
      const sanitizedOriginalName = sanitizeFilename(req.file.originalname);
      
      // Cắt audio trước khi lưu (nếu có trimming)
      let finalBuffer = req.file.buffer;
      let finalFilename = sanitizedOriginalName;
      
      if (audioStartOffset > 0 || audioDuration) {
        console.log(`[SONG] Trimming audio: startOffset=${audioStartOffset}s, duration=${audioDuration}s`);
        try {
          const ext = path.extname(sanitizedOriginalName) || '.mp3';
          finalBuffer = await trimAudio(req.file.buffer, audioStartOffset, audioDuration, ext);
          // Đổi tên file để phân biệt file đã cắt (luôn dùng .mp3 vì output là mp3)
          const nameWithoutExt = path.basename(sanitizedOriginalName, ext);
          finalFilename = `${nameWithoutExt}_trimmed.mp3`;
          console.log(`[SONG] Audio trimmed successfully. Original size: ${req.file.buffer.length} bytes, Trimmed size: ${finalBuffer.length} bytes`);
        } catch (trimError) {
          console.error("[SONG] Error trimming audio, using original file:", trimError);
          // Nếu cắt lỗi, dùng file gốc đã sanitize
          finalBuffer = req.file.buffer;
          finalFilename = sanitizedOriginalName;
        }
      }
      
      // Lưu file đã cắt vào GridFS
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
      // Nếu file đã cắt, contentType luôn là audio/mpeg (mp3)
      const contentType = finalFilename.endsWith('_trimmed.mp3') ? 'audio/mpeg' : req.file.mimetype;
      const stream = bucket.openUploadStream(finalFilename, {
        contentType: contentType,
    });
      stream.end(finalBuffer);
      
    stream.on("finish", async () => {
      const newSong = new Song({
        title,
        artistName: artist,
          album: album || "", // Optional, default empty string
          description: description || "", // Optional, default empty string
          accountId: authorId, // Backward compatibility
          entityAccountId: songEntityAccountId, // Primary field
          entityId: songEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
          entityType: songEntityType, // Entity Type (Account, BarPage, BusinessAccount)
        song: stream.filename,
        file: stream.id,
          audioStartOffset: 0, // File đã cắt rồi nên startOffset = 0
          audioDuration: audioDuration || null, // Độ dài đã cắt (tối đa 30s)
      });
      await newSong.save();
        res.status(201).json({ 
          message: "Song added successfully", 
          status: "success",
          data: newSong
        });
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
//@route  DELETE /api/v1/song/delete/:id
//@access Private
const deleteSong = async (req, res) => {
  try {
    console.log("Đang gọi API xóa bài hát");
    console.log("File cần xóa:", req.query.file);
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
    if (song.uploadedBy && song.uploadedBy.toString() !== req.userId) {
      res.status(401);
      throw new Error("Không có quyền xóa bài hát này");
    }
    await Song.findByIdAndDelete(id);

    // Nếu có file id (GridFS), tiến hành xóa file khỏi GridFS
    if (req.query.file) {
      try {
        const mongoose = require("mongoose");
        const db = mongoose.connection.db;
        const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
        // Xóa file theo id (ObjectId)
        await bucket.delete(new mongodb.ObjectId(req.query.file));
        console.log("Đã xóa file khỏi GridFS");
      } catch (err) {
        console.log("Lỗi khi xóa file GridFS:", err.message);
        // Không trả lỗi về client, chỉ log
      }
    }

    res.status(200).json({ message: "Đã xóa bài hát thành công", status: "success" });
  } catch (error) {
    console.log(error);
    return res.json({ error: error.message, status: "error" });
  }
};

// @desc    Get all songs
// @route   GET /api/v1/songs
// @access  Public
const getSongs = async (req, res) => {
  try {
   
    const songs = await Song.find({});
    // if (!songs || songs.length === 0) {
    //   res.status(404);
    //   throw new Error("No songs found");
    // }
    res.status(200).json({ songs });
  } catch (error) {
    console.log(error);
    return res.json({ error: error.message, status: "error" });
  }
};

// @desc: Stream a song
// @route : GET /api/v1/song/download/:filename
// @access  Public
const streamSong = async (req, res) => {
  try {
    // if no file name is provided throw an error
    if (!req.params.filename) {
      res.status(400);
      throw new Error("No file name provided");
    }
    // Lấy kết nối db từ mongoose
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const bucket = new mongodb.GridFSBucket(db, {
      bucketName: "uploads",
    });

    // setting the content type of the file


    // streaming the file to the client
    const downloadStream = bucket.openDownloadStreamByName(req.params.filename).pipe(res).on("error", (error) => { throw error; });
    
    downloadStream.on("end", () => {
      res.end();
    });

    // if there is an error throw an error
  } catch (error) {
    console.log(error.message);
    return res.json({ error: error.message, status: "error" });
  }
};

module.exports = {
  addSong,
  deleteSong,
  getSongs,
  streamSong
};