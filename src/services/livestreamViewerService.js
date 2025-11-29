const livestreamRepository = require("../repositories/livestreamRepository");
const livestreamConfig = require("../config/livestreamConfig");
const agoraService = require("./agoraService");
const { getPool, sql } = require("../db/sqlserver");

/**
 * Enrich livestream với thông tin broadcaster (tên, avatar) từ EntityAccounts
 */
async function enrichLivestreamsWithBroadcasterInfo(livestreams) {
  if (!livestreams || livestreams.length === 0) {
    return livestreams;
  }

  try {
    const pool = await getPool();
    if (!pool) {
      console.warn("[LivestreamViewerService] SQL pool not available, skipping enrichment");
      return livestreams;
    }

    // Collect unique hostEntityAccountIds
    const hostEntityAccountIds = [];
    for (const livestream of livestreams) {
      if (livestream.hostEntityAccountId) {
        const idStr = String(livestream.hostEntityAccountId).trim();
        if (idStr && idStr !== 'null' && idStr !== 'undefined' && !hostEntityAccountIds.includes(idStr)) {
          hostEntityAccountIds.push(idStr);
        }
      }
    }

    if (hostEntityAccountIds.length === 0) {
      return livestreams;
    }

    // Query từ EntityAccounts và join với Accounts/BarPages/BusinessAccounts để lấy name và avatar
    const placeholders = hostEntityAccountIds.map((_, i) => `@EntityAccountId${i}`).join(',');
    const request = pool.request();
    
    hostEntityAccountIds.forEach((entityAccountId, i) => {
      try {
        request.input(`EntityAccountId${i}`, sql.UniqueIdentifier, entityAccountId);
      } catch (err) {
        console.warn(`[LivestreamViewerService] Invalid EntityAccountId format at index ${i}: ${entityAccountId}`, err.message);
      }
    });

    const entityQuery = await request.query(`
      SELECT 
        EA.EntityAccountId,
        EA.EntityType,
        EA.EntityId,
        EA.AccountId,
        CASE 
          WHEN EA.EntityType = 'Account' THEN A.UserName
          WHEN EA.EntityType = 'BarPage' THEN BP.BarName
          WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
          ELSE NULL
        END AS UserName,
        CASE 
          WHEN EA.EntityType = 'Account' THEN A.Avatar
          WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
          WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
          ELSE NULL
        END AS Avatar
      FROM EntityAccounts EA
      LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
      LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
      LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
      WHERE EA.EntityAccountId IN (${placeholders})
    `);

    const entityMap = new Map();
    if (entityQuery && entityQuery.recordset) {
      entityQuery.recordset.forEach(row => {
        const entityAccountIdStr = String(row.EntityAccountId).trim().toLowerCase();
        entityMap.set(entityAccountIdStr, {
          broadcasterName: row.UserName || 'Người dùng',
          broadcasterAvatar: row.Avatar || null,
          broadcasterEntityType: row.EntityType,
          broadcasterEntityId: row.EntityId,
        });
      });
    }

    // Enrich mỗi livestream với broadcaster info
    for (const livestream of livestreams) {
      if (livestream.hostEntityAccountId) {
        const entityAccountIdStr = String(livestream.hostEntityAccountId).trim().toLowerCase();
        const entityInfo = entityMap.get(entityAccountIdStr);
        
        if (entityInfo) {
          livestream.broadcasterName = entityInfo.broadcasterName;
          livestream.broadcasterAvatar = entityInfo.broadcasterAvatar;
          livestream.broadcasterEntityType = entityInfo.broadcasterEntityType;
          livestream.broadcasterEntityId = entityInfo.broadcasterEntityId;
        } else {
          // Fallback nếu không tìm thấy
          livestream.broadcasterName = 'Người dùng';
          livestream.broadcasterAvatar = null;
        }
      }
    }

    return livestreams;
  } catch (err) {
    console.error("[LivestreamViewerService] Error enriching livestreams with broadcaster info:", err);
    return livestreams; // Return original nếu có lỗi
  }
}

async function getLivestream(livestreamId) {
  let livestream = await livestreamRepository.findById(livestreamId);
  if (livestream) {
    // Convert to plain object nếu là Mongoose document
    if (livestream.toObject) {
      livestream = livestream.toObject();
    }
    await enrichLivestreamsWithBroadcasterInfo([livestream]);
  }
  return livestream;
}

async function getActiveLivestreams() {
  const livestreams = await livestreamRepository.findActive(livestreamConfig.limits.listPageSize);
  await enrichLivestreamsWithBroadcasterInfo(livestreams);
  return livestreams;
}

async function incrementViewCount(livestreamId) {
  const livestream = await livestreamRepository.findById(livestreamId);
  if (!livestream) {
    return null;
  }
  return await livestreamRepository.incrementView(livestreamId);
}

async function getStreamByChannel(channelName) {
  let livestream = await livestreamRepository.findByChannel(channelName);
  if (!livestream) {
    return null;
  }

  // Convert to plain object nếu là Mongoose document
  if (livestream.toObject) {
    livestream = livestream.toObject();
  }
  
  await enrichLivestreamsWithBroadcasterInfo([livestream]);
  const viewerToken = agoraService.getSubscriberToken(channelName);
  return { livestream, agora: viewerToken };
}

async function getLivestreamsByHost(hostAccountId, limit) {
  const livestreams = await livestreamRepository.findByHost(hostAccountId, limit);
  // livestreams đã là plain objects từ .lean()
  await enrichLivestreamsWithBroadcasterInfo(livestreams);
  return livestreams;
}

module.exports = {
  getLivestream,
  getActiveLivestreams,
  incrementViewCount,
  getStreamByChannel,
  getLivestreamsByHost,
};

