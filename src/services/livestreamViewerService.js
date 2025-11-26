const livestreamRepository = require("../repositories/livestreamRepository");
const livestreamConfig = require("../config/livestreamConfig");
const agoraService = require("./agoraService");

async function getLivestream(livestreamId) {
  return await livestreamRepository.findById(livestreamId);
}

async function getActiveLivestreams() {
  return await livestreamRepository.findActive(livestreamConfig.limits.listPageSize);
}

async function incrementViewCount(livestreamId) {
  const livestream = await livestreamRepository.findById(livestreamId);
  if (!livestream) {
    return null;
  }
  return await livestreamRepository.incrementView(livestreamId);
}

async function getStreamByChannel(channelName) {
  const livestream = await livestreamRepository.findByChannel(channelName);
  if (!livestream) {
    return null;
  }

  const viewerToken = agoraService.getSubscriberToken(channelName);
  return { livestream, agora: viewerToken };
}

async function getLivestreamsByHost(hostAccountId, limit) {
  return await livestreamRepository.findByHost(hostAccountId, limit);
}

module.exports = {
  getLivestream,
  getActiveLivestreams,
  incrementViewCount,
  getStreamByChannel,
  getLivestreamsByHost,
};

