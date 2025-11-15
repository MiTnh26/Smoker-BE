const livestreamModel = require("../models/livestreamModel");
const agoraService = require("../services/agoraService");
const { success, error } = require("../utils/response");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");

// POST /api/livestream/start - Create stream and return Agora token
exports.startLivestream = async (req, res) => {
  try {
    console.log("🎬 Starting livestream...");
    console.log("🎬 Request body:", req.body);
    console.log("🎬 Request user:", req.user);
    const { title, description, entityAccountId, entityId, entityType } = req.body;
    const hostAccountId = req.user?.id; // AccountId from JWT middleware
    console.log("🎬 User ID:", hostAccountId, "Title:", title);

    // Validate required fields
    if (!title) {
      console.log("❌ Missing title");
      return res.status(400).json(error("Title is required"));
    }
    if (!hostAccountId) {
      console.log("❌ Missing hostAccountId. req.user:", req.user);
      return res.status(400).json(error("Authentication required. Please login again."));
    }

    // Lấy entityAccountId, entityId, entityType
    let hostEntityAccountId = entityAccountId;
    let hostEntityId = entityId;
    let hostEntityType = entityType;

    if (!hostEntityAccountId) {
      // Fallback: lấy EntityAccountId của Account chính
      try {
        hostEntityAccountId = await getEntityAccountIdByAccountId(hostAccountId);
        if (hostEntityAccountId && !hostEntityId) {
          hostEntityId = String(hostAccountId);
          hostEntityType = "Account";
        }
      } catch (err) {
        console.error("[Livestream] Could not get EntityAccountId:", err);
        return res.status(400).json(error("Could not determine EntityAccountId for livestream"));
      }
    }

    // Nếu có entityAccountId nhưng chưa có entityType, query để lấy
    if (hostEntityAccountId && !hostEntityType) {
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input("EntityAccountId", sql.UniqueIdentifier, hostEntityAccountId)
          .query(`SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`);
        
        if (result.recordset.length > 0) {
          hostEntityType = result.recordset[0].EntityType;
          if (!hostEntityId) {
            hostEntityId = String(result.recordset[0].EntityId);
          }
        }
      } catch (err) {
        console.warn("[Livestream] Could not get EntityType from EntityAccountId:", err);
      }
    }

    // Check if user already has an active stream and end it automatically
    const existingActiveStream = await livestreamModel.getAllActiveLivestreams();
    const userActiveStream = existingActiveStream.find(
      (stream) => stream.hostEntityAccountId === hostEntityAccountId || stream.hostAccountId === hostAccountId
    );

    if (userActiveStream) {
      console.log("🔄 Ending existing active stream before creating new one:", userActiveStream.livestreamId);
      // Automatically end the existing stream
      await livestreamModel.endLivestream(userActiveStream.livestreamId);
      console.log("✅ Existing stream ended");
    }

    // Generate Agora channel credentials
    console.log("🎬 Generating Agora credentials...");
    const agoraCredentials = agoraService.getChannelCredentials(hostAccountId);
    console.log("🎬 Agora credentials generated:", agoraCredentials.channelName);

    // Create livestream in database
    const livestreamData = {
      hostAccountId, // Backward compatibility
      hostEntityAccountId, // Primary field
      hostEntityId, // Entity ID (AccountId, BarPageId, BusinessAccountId)
      hostEntityType, // Entity Type (Account, BarPage, BusinessAccount)
      title,
      description: description || "",
      agoraChannelName: agoraCredentials.channelName,
      agoraUid: agoraCredentials.uid,
    };

    const livestream = await livestreamModel.createLivestream(livestreamData);
    console.log("🎬 Livestream created:", livestream.livestreamId);

    // Return success with credentials
    return res.status(201).json(
      success("Livestream started successfully", {
        livestream: {
          livestreamId: livestream.livestreamId,
          title: livestream.title,
          description: livestream.description,
          startTime: livestream.startTime,
        },
        agora: agoraCredentials,
      })
    );
  } catch (err) {
    console.error("startLivestream error:", err);
    return res.status(500).json(error(err.message || "Failed to start livestream"));
  }
};

// GET /api/livestream/:id - Get stream details
exports.getLivestream = async (req, res) => {
  try {
    const { id } = req.params;
    const livestream = await livestreamModel.getLivestreamById(id);

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

    // Get livestream
    const livestream = await livestreamModel.getLivestreamById(id);

    if (!livestream) {
      return res.status(404).json(error("Livestream not found"));
    }

    // Check if user owns the stream
    if (livestream.hostAccountId !== hostAccountId) {
      return res.status(403).json(error("You do not have permission to end this stream"));
    }

    // Check if already ended
    if (livestream.status === "ended") {
      return res.status(400).json(error("This livestream has already ended"));
    }

    // End the stream
    const endedLivestream = await livestreamModel.endLivestream(id);

    return res.json(success("Livestream ended successfully", endedLivestream));
  } catch (err) {
    console.error("endLivestream error:", err);
    return res.status(500).json(error(err.message || "Failed to end livestream"));
  }
};

// GET /api/livestream/active - Get all active streams
exports.getActiveLivestreams = async (req, res) => {
  try {
    const streams = await livestreamModel.getAllActiveLivestreams();
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
    const livestream = await livestreamModel.getLivestreamById(id);

    if (!livestream) {
      return res.status(404).json(error("Livestream not found"));
    }

    const updated = await livestreamModel.incrementViewCount(id);
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
    const livestream = await livestreamModel.getLivestreamByChannel(channelName);

    if (!livestream) {
      return res.status(404).json(error("Livestream not found"));
    }

    // Generate subscriber token for viewer
    const viewerToken = agoraService.getSubscriberToken(channelName);

    return res.json(
      success("Stream retrieved successfully", {
        livestream,
        agora: viewerToken,
      })
    );
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

    const streams = await livestreamModel.getLivestreamsByHost(hostId, Number.parseInt(limit, 10) || 20);
    return res.json(success("Host livestreams retrieved successfully", streams));
  } catch (err) {
    console.error("getLivestreamsByHost error:", err);
    return res.status(500).json(error(err.message || "Failed to get host livestreams"));
  }
};

