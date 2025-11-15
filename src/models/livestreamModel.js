const mongoose = require("mongoose");

const LivestreamSchema = new mongoose.Schema(
  {
    livestreamId: {
      type: String,
      required: true,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },
    hostAccountId: {
      type: String,
      default: null, // Backward compatibility
      ref: "Account",
    },
    hostEntityAccountId: {
      type: String, // Lưu EntityAccountId - ID của role/entity đang livestream
      required: true,
      index: true,
    },
    hostEntityId: {
      type: String, // Lưu EntityId - ID của entity cụ thể (AccountId, BarPageId, BusinessAccountId)
      default: null,
      index: true,
    },
    hostEntityType: {
      type: String, // Lưu EntityType - Loại entity: "Account", "BarPage", "BusinessAccount"
      enum: ["Account", "BarPage", "BusinessAccount"],
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["live", "ended"],
      default: "live",
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
    agoraChannelName: {
      type: String,
      required: true,
    },
    agoraUid: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes
LivestreamSchema.index({ status: 1, startTime: -1 });
LivestreamSchema.index({ hostAccountId: 1 });
LivestreamSchema.index({ livestreamId: 1 });
LivestreamSchema.index({ hostEntityAccountId: 1 }); // Index cho hostEntityAccountId
LivestreamSchema.index({ hostEntityType: 1, hostEntityId: 1 }); // Composite index cho hostEntityType và hostEntityId

const Livestream = mongoose.model("Livestream", LivestreamSchema);

// Create a new livestream
async function createLivestream(data) {
  const livestream = new Livestream(data);
  return await livestream.save();
}

// Get livestream by ID
async function getLivestreamById(livestreamId) {
  return await Livestream.findOne({ livestreamId });
}

// Get livestream by agora channel name
async function getLivestreamByChannel(channelName) {
  return await Livestream.findOne({ agoraChannelName: channelName });
}

// Update livestream
async function updateLivestream(livestreamId, updates) {
  return await Livestream.findOneAndUpdate(
    { livestreamId },
    { $set: updates },
    { new: true }
  );
}

// End livestream
async function endLivestream(livestreamId, recordingUrl = null) {
  return await Livestream.findOneAndUpdate(
    { livestreamId },
    {
      $set: {
        status: "ended",
        endTime: new Date(),
        recordingUrl: recordingUrl,
      },
    },
    { new: true }
  );
}

// Get all active livestreams
async function getAllActiveLivestreams() {
  return await Livestream.find({ status: "live" })
    .sort({ startTime: -1 })
    .limit(50);
}

// Increment view count
async function incrementViewCount(livestreamId) {
  return await Livestream.findOneAndUpdate(
    { livestreamId },
    { $inc: { viewCount: 1 } },
    { new: true }
  );
}

// Get livestreams by host
async function getLivestreamsByHost(hostAccountId, limit = 20) {
  return await Livestream.find({ hostAccountId })
    .sort({ startTime: -1 })
    .limit(limit);
}

module.exports = {
  createLivestream,
  getLivestreamById,
  getLivestreamByChannel,
  updateLivestream,
  endLivestream,
  getAllActiveLivestreams,
  incrementViewCount,
  getLivestreamsByHost,
};

