const livestreamRepository = require("../repositories/livestreamRepository");
const agoraService = require("./agoraService");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const { getPool, sql } = require("../db/sqlserver");
const livestreamConfig = require("../config/livestreamConfig");

async function resolveHostEntity({ hostAccountId, entityAccountId, entityId, entityType }) {
  let hostEntityAccountId = entityAccountId;
  let hostEntityId = entityId;
  let hostEntityType = entityType;

  if (!hostEntityAccountId) {
    hostEntityAccountId = await getEntityAccountIdByAccountId(hostAccountId);
    if (hostEntityAccountId && !hostEntityId) {
      hostEntityId = String(hostAccountId);
      hostEntityType = "Account";
    }
  }

  if (hostEntityAccountId && !hostEntityType) {
    try {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("EntityAccountId", sql.UniqueIdentifier, hostEntityAccountId)
        .query(
          `SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @EntityAccountId`
        );

      if (result.recordset.length > 0) {
        hostEntityType = result.recordset[0].EntityType;
        if (!hostEntityId) {
          hostEntityId = String(result.recordset[0].EntityId);
        }
      }
    } catch (err) {
      console.warn("[LivestreamService] Could not get EntityType from EntityAccountId:", err);
    }
  }

  return { hostEntityAccountId, hostEntityId, hostEntityType };
}

async function ensureNoParallelLivestream(hostAccountId, hostEntityAccountId) {
  const activeStreams = await livestreamRepository.findActive(livestreamConfig.limits.maxActive);
  const existing = activeStreams.find(
    (stream) =>
      stream.hostEntityAccountId === hostEntityAccountId || stream.hostAccountId === hostAccountId
  );

  if (existing) {
    await livestreamRepository.updateStatus(existing.livestreamId, {
      status: "ended",
      endTime: new Date(),
    });
  }
}

async function startLivestream(payload) {
  const { title, description = "", hostAccountId, entityAccountId, entityId, entityType } = payload;

  if (!title) {
    throw new Error("Title is required");
  }
  if (!hostAccountId) {
    throw new Error("Authentication required. Please login again.");
  }

  const { hostEntityAccountId, hostEntityId, hostEntityType } = await resolveHostEntity({
    hostAccountId,
    entityAccountId,
    entityId,
    entityType,
  });

  if (!hostEntityAccountId) {
    throw new Error("Could not determine EntityAccountId for livestream");
  }

  await ensureNoParallelLivestream(hostAccountId, hostEntityAccountId);

  const agoraCredentials = agoraService.getChannelCredentials(hostAccountId);

  const livestream = await livestreamRepository.create({
    hostAccountId,
    hostEntityAccountId,
    hostEntityId,
    hostEntityType,
    title,
    description,
    agoraChannelName: agoraCredentials.channelName,
    agoraUid: agoraCredentials.uid,
  });

  return { livestream, agora: agoraCredentials };
}

async function endLivestream(livestreamId, hostAccountId) {
  const livestream = await livestreamRepository.findById(livestreamId);
  if (!livestream) {
    throw new Error("Livestream not found");
  }
  if (livestream.hostAccountId !== hostAccountId) {
    const err = new Error("You do not have permission to end this stream");
    err.status = 403;
    throw err;
  }
  if (livestream.status === "ended") {
    const err = new Error("This livestream has already ended");
    err.status = 400;
    throw err;
  }

  const updatedLivestream = await livestreamRepository.updateStatus(livestreamId, {
    status: "ended",
    endTime: new Date(),
  });
  
  // Trả về livestream với đầy đủ thông tin (bao gồm agoraChannelName) để emit socket event
  return updatedLivestream || livestream;
}

module.exports = {
  startLivestream,
  endLivestream,
};

