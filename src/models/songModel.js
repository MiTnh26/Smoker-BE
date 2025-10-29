const mongoose = require("mongoose");

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description:{
    type: String,
    required: true,
    trim: true,
  },
  artistName: {
    type: String,
    required: true,
    trim: true,
  },
  album: {
    type: String,
    required: true,
    trim: true,
  },
  song: {
    type: String,
    required: false,
    trim: true,
  },
  file: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    ref: 'uploads.files',
  },
});
module.exports = mongoose.model("Song", songSchema, "songs");
 