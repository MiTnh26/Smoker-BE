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

async function createScheduled(data) {
  try {
    console.log("[LivestreamRepository] createScheduled - Input data:", {
      hostAccountId: data.hostAccountId,
      hostEntityAccountId: data.hostEntityAccountId,
      hostEntityId: data.hostEntityId,
      hostEntityType: data.hostEntityType,
      title: data.title,
      scheduledStartTime: data.scheduledStartTime,
    });
    
    const livestream = await Livestream.create({
      ...data,
      status: "scheduled",
    });
    
    console.log("[LivestreamRepository] createScheduled - Created livestream:", livestream?.livestreamId);
    return livestream;
  } catch (err) {
    console.error("[LivestreamRepository] createScheduled error:", err);
    console.error("[LivestreamRepository] Error details:", {
      message: err.message,
      name: err.name,
      code: err.code,
      errors: err.errors,
    });
    throw err;
  }
}

async function findScheduled(limit = 50) {
  return await Livestream.find({ status: "scheduled" })
    .sort({ scheduledStartTime: 1 })
    .limit(limit)
    .lean();
}

async function findScheduledByHost(hostAccountId, limit = 20) {
  return await Livestream.find({
    hostAccountId,
    status: "scheduled",
  })
    .sort({ scheduledStartTime: 1 })
    .limit(limit)
    .lean();
}

async function findScheduledReadyToActivate(now) {
  return await Livestream.find({
    status: "scheduled",
    scheduledStartTime: { $lte: now },
  })
    .sort({ scheduledStartTime: 1 })
    .lean();
}

async function activateScheduled(livestreamId, agoraCredentials) {
  return await Livestream.findOneAndUpdate(
    { livestreamId, status: "scheduled" },
    {
      $set: {
        status: "live",
        startTime: new Date(),
        agoraChannelName: agoraCredentials.channelName,
        agoraUid: agoraCredentials.uid,
      },
    },
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
  createScheduled,
  findScheduled,
  findScheduledByHost,
  findScheduledReadyToActivate,
  activateScheduled,
};

