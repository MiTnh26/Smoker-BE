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
    
    // Emit socket event để thông báo cho tất cả viewers
    try {
      const { getIO } = require("../utils/socket");
      const io = getIO();
      if (io && endedLivestream?.agoraChannelName) {
        const room = `livestream:${endedLivestream.agoraChannelName}`;
        io.to(room).emit("livestream-ended", {
          livestreamId: id,
          channelName: endedLivestream.agoraChannelName,
          message: "Phiên live đã kết thúc"
        });
        console.log(`[LivestreamController] Emitted livestream-ended event to room ${room}`);
      }
    } catch (socketErr) {
      console.warn("[LivestreamController] Could not emit livestream-ended event:", socketErr.message);
    }
    
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

// POST /api/livestream/schedule - Create scheduled livestream
exports.createScheduledLivestream = async (req, res) => {
  try {
    const { title, description, scheduledStartTime, settings, entityAccountId, entityId, entityType } = req.body;
    const hostAccountId = req.user?.id;

    const { livestream, agora } = await livestreamService.createScheduledLivestream({
      title,
      description,
      scheduledStartTime,
      settings,
      hostAccountId,
      entityAccountId,
      entityId,
      entityType,
    });

    return res
      .status(201)
      .json(success("Scheduled livestream created successfully", { livestream, agora }));
  } catch (err) {
    console.error("createScheduledLivestream error:", err);
    const status = err.status || 500;
    return res.status(status).json(error(err.message || "Failed to create scheduled livestream", status));
  }
};

// GET /api/livestream/scheduled - Get scheduled livestreams
exports.getScheduledLivestreams = async (req, res) => {
  try {
    const hostAccountId = req.user?.id || null;
    const streams = await livestreamService.getScheduledLivestreams(hostAccountId);
    return res.json(success("Scheduled livestreams retrieved successfully", streams));
  } catch (err) {
    console.error("getScheduledLivestreams error:", err);
    return res.status(500).json(error(err.message || "Failed to get scheduled livestreams"));
  }
};

// DELETE /api/livestream/scheduled/:id - Cancel scheduled livestream
exports.cancelScheduledLivestream = async (req, res) => {
  try {
    const { id } = req.params;
    const hostAccountId = req.user.id;
    const cancelled = await livestreamService.cancelScheduledLivestream(id, hostAccountId);
    return res.json(success("Scheduled livestream cancelled successfully", cancelled));
  } catch (err) {
    console.error("cancelScheduledLivestream error:", err);
    const status = err.status || 500;
    return res.status(status).json(error(err.message || "Failed to cancel scheduled livestream", status));
  }
};

// POST /api/livestream/scheduled/:id/activate - Activate scheduled livestream (internal/cron)
exports.activateScheduledLivestream = async (req, res) => {
  try {
    const { id } = req.params;
    const { livestream, agora } = await livestreamService.activateScheduledLivestream(id);
    
    // Emit socket event để thông báo livestream đã bắt đầu
    try {
      const { getIO } = require("../utils/socket");
      const io = getIO();
      if (io && livestream?.agoraChannelName) {
        const room = `livestream:${livestream.agoraChannelName}`;
        io.to(room).emit("livestream-started", {
          livestreamId: livestream.livestreamId,
          channelName: livestream.agoraChannelName,
          message: "Livestream đã bắt đầu",
        });
        console.log(`[LivestreamController] Emitted livestream-started event to room ${room}`);
      }
    } catch (socketErr) {
      console.warn("[LivestreamController] Could not emit livestream-started event:", socketErr.message);
    }
    
    return res.json(success("Scheduled livestream activated successfully", { livestream, agora }));
  } catch (err) {
    console.error("activateScheduledLivestream error:", err);
    const status = err.status || 500;
    return res.status(status).json(error(err.message || "Failed to activate scheduled livestream", status));
  }
};

