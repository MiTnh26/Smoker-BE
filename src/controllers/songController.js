const Song = require("../models/songModel.js");
const fs = require("fs");
const mongodb = require("mongodb");

// @desc    Add a new song
// @route   POST /api/v1/song/upload
// @access  Private
const addSong = async (req, res) => {
  try {
    const { title, artist, album, description } = req.body;
    if (!title || !artist || !album || !description) {
      res.status(400);
      throw new Error("Please add all fields");
    }
    if (!req.file) {
      res.status(400);
      throw new Error("No file uploaded");
    }
    // Lưu file vào GridFS
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
    const stream = bucket.openUploadStream(req.file.originalname, {
      contentType: req.file.mimetype,
    });
    stream.end(req.file.buffer);
    stream.on("finish", async () => {
      const newSong = new Song({
        title,
        artistName: artist,
        album,
        description,
        uploadedBy: req.userId,
        song: stream.filename,
        file: stream.id,
      });
      await newSong.save();
      res.status(201).json({ message: "Song added successfully", status: "success" });
    });
    stream.on("error", (err) => {
      console.log(err);
      res.status(500).json({ error: "Error uploading file to GridFS" });
    });
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