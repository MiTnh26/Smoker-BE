const { success, error } = require("../utils/response");
const { livestreamService, livestreamViewerService } = require("../services");

// POST /api/livestream/start - Create stream and return Agora token
exports.startLivestream = async (req, res) => {
  try {
    const { title, description, entityAccountId, entityId, entityType } = req.body;
    const hostAccountId = req.user?.id;

    const { livestream, agora } = await livestreamService.startLivestream({
      title,
      description,
      hostAccountId,
      entityAccountId,
      entityId,
      entityType,
    });

    return res
      .status(201)
      .json(success("Livestream started successfully", { livestream, agora }));
  } catch (err) {
    console.error("startLivestream error:", err);
    const status = err.status || 500;
    return res.status(status).json(error(err.message || "Failed to start livestream", status));
  }
};

// GET /api/livestream/:id - Get stream details
exports.getLivestream = async (req, res) => {
  try {
    const { id } = req.params;
    const livestream = await livestreamViewerService.getLivestream(id);

    if (!livestream) {
      return res.status(404).json(error("Livestream not found"));
    }

    return res.json(success("Livestream retrieved successfully", livestream));
  } catch (err) {
    console.error("getLivestream error:", err);
    return res.status(500).json(error(err.message || "Failed to get livestream"));
  }
};

// POST /api/livestream/:id/end - End stream
exports.endLivestream = async (req, res) => {
  try {
    const { id } = req.params;
    const hostAccountId = req.user.id;
    const endedLivestream = await livestreamService.endLivestream(id, hostAccountId);
    return res.json(success("Livestream ended successfully", endedLivestream));
  } catch (err) {
    console.error("endLivestream error:", err);
    const status = err.status || 500;
    return res.status(status).json(error(err.message || "Failed to end livestream", status));
  }
};

// GET /api/livestream/active - Get all active streams
exports.getActiveLivestreams = async (req, res) => {
  try {
    const streams = await livestreamViewerService.getActiveLivestreams();
    return res.json(success("Active livestreams retrieved successfully", streams));
  } catch (err) {
    console.error("getActiveLivestreams error:", err);
    return res.status(500).json(error(err.message || "Failed to get active livestreams"));
  }
};

// POST /api/livestream/:id/view - Increment view count
exports.incrementViewCount = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await livestreamViewerService.incrementViewCount(id);
    if (!updated) {
      return res.status(404).json(error("Livestream not found"));
    }

    return res.json(success("View count updated", { viewCount: updated.viewCount }));
  } catch (err) {
    console.error("incrementViewCount error:", err);
    return res.status(500).json(error(err.message || "Failed to update view count"));
  }
};

// GET /api/livestream/channel/:channelName - Get stream by channel name and generate viewer token
exports.getStreamByChannel = async (req, res) => {
  try {
    const { channelName } = req.params;
    const result = await livestreamViewerService.getStreamByChannel(channelName);
    if (!result) {
      return res.status(404).json(error("Livestream not found"));
    }
    return res.json(success("Stream retrieved successfully", result));
  } catch (err) {
    console.error("getStreamByChannel error:", err);
    return res.status(500).json(error(err.message || "Failed to get stream"));
  }
};

// GET /api/livestream/host/:hostId - Get livestreams by host
exports.getLivestreamsByHost = async (req, res) => {
  try {
    const { hostId } = req.params;
    const { limit = 20 } = req.query;

    const streams = await livestreamViewerService.getLivestreamsByHost(
      hostId,
      Number.parseInt(limit, 10) || 20
    );
    return res.json(success("Host livestreams retrieved successfully", streams));
  } catch (err) {
    console.error("getLivestreamsByHost error:", err);
    return res.status(500).json(error(err.message || "Failed to get host livestreams"));
  }
};

