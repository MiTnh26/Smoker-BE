const Livestream = require("../models/livestreamModel");

async function create(data) {
  return await Livestream.create(data);
}

async function findById(livestreamId) {
  return await Livestream.findOne({ livestreamId });
}

async function findByChannel(agoraChannelName) {
  return await Livestream.findOne({ agoraChannelName });
}

async function findActive(limit = 50) {
  const livestreams = await Livestream.find({ status: "live" })
    .sort({ startTime: -1 })
    .limit(limit)
    .lean(); // Convert to plain objects để có thể enrich dễ dàng
  return livestreams;
}

async function findByHost(hostAccountId, limit = 20) {
  return await Livestream.find({ hostAccountId })
    .sort({ startTime: -1 })
    .limit(limit)
    .lean(); // Convert to plain objects
}

async function updateStatus(livestreamId, updates) {
  return await Livestream.findOneAndUpdate(
    { livestreamId },
    { $set: updates },
    { new: true }
  );
}

async function incrementView(livestreamId) {
  return await Livestream.findOneAndUpdate(
    { livestreamId },
    { $inc: { viewCount: 1 } },
    { new: true }
  );
}

module.exports = {
  create,
  findById,
  findByChannel,
  findActive,
  findByHost,
  updateStatus,
  incrementView,
};

