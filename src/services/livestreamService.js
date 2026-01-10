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
  const { title, description = "", pinnedComment = null, hostAccountId, entityAccountId, entityId, entityType } = payload;

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
    pinnedComment: pinnedComment || null,
    agoraChannelName: agoraCredentials.channelName,
    agoraUid: agoraCredentials.uid,
  });

  // Gửi notification cho những người follow chủ livestream
  try {
    const FollowModel = require("../models/followModel");
    
    // Lấy danh sách followers của chủ livestream
    // getFollowers trả về recordset từ SQL Server
    const followersResult = await FollowModel.getFollowers(hostEntityAccountId);
    const followers = Array.isArray(followersResult) ? followersResult : (followersResult?.recordset || []);
    
    console.log(`[LivestreamService] Found ${followers?.length || 0} followers for hostEntityAccountId: ${hostEntityAccountId}`);
    if (followers && followers.length > 0) {
      console.log(`[LivestreamService] First follower sample:`, followers[0]);
    }
    
    if (followers && followers.length > 0) {
      // Lấy thông tin chủ livestream để tạo notification
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();
      const hostInfoResult = await pool.request()
        .input("EntityAccountId", sql.UniqueIdentifier, hostEntityAccountId)
        .query(`
          SELECT TOP 1
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
          WHERE EA.EntityAccountId = @EntityAccountId
        `);
      
      const hostName = hostInfoResult.recordset[0]?.UserName || "Người dùng";
      const hostAvatar = hostInfoResult.recordset[0]?.Avatar || null;
      
      // Tạo notification cho mỗi follower
      let successCount = 0;
      let errorCount = 0;
      
      for (const follower of followers) {
        try {
          // Kiểm tra follower có EntityAccountId không
          if (!follower.EntityAccountId) {
            console.warn(`[LivestreamService] Follower missing EntityAccountId:`, follower);
            errorCount++;
            continue;
          }
          
          const followerEntityAccountId = String(follower.EntityAccountId).trim().toLowerCase();
          console.log(`[LivestreamService] Creating notification for follower: ${followerEntityAccountId}`);
          
          const Notification = require("../models/notificationModel");
          const notification = new Notification({
            type: "Livestream",
            sender: hostAccountId || null,
            senderEntityAccountId: String(hostEntityAccountId).trim().toLowerCase(),
            senderEntityId: hostEntityId || null,
            senderEntityType: hostEntityType || null,
            receiver: follower.AccountId || null,
            receiverEntityAccountId: followerEntityAccountId,
            receiverEntityId: follower.EntityId || null,
            receiverEntityType: follower.EntityType || null,
            content: `${hostName} đang phát trực tiếp: ${title || "Livestream"}`,
            link: `/livestream/${livestream.livestreamId}`,
            status: "Unread",
            isAnonymous: false
          });
          
          await notification.save();
          console.log(`[LivestreamService] Notification created: ${notification._id} for follower ${followerEntityAccountId}`);
          
          // Emit socket event cho real-time notification
          try {
            const { getIO } = require("../utils/socket");
            const io = getIO();
            if (!io) {
              console.warn('[LivestreamService] Socket IO not available');
            } else {
              const notificationPayload = {
                notificationId: notification._id.toString(),
                type: notification.type,
                senderEntityAccountId: notification.senderEntityAccountId,
                receiverEntityAccountId: notification.receiverEntityAccountId,
                content: notification.content,
                link: notification.link,
                status: notification.status,
                createdAt: notification.createdAt,
                isAnonymous: notification.isAnonymous,
                sender: {
                  name: hostName,
                  avatar: hostAvatar
                }
              };
              
              // Emit đến cả room EntityAccountId (lowercase) và room userId nếu có
              const receiverRoom = followerEntityAccountId;
              io.to(receiverRoom).emit('new_notification', notificationPayload);
              
              // Cũng emit đến room userId nếu có (để tương thích với code cũ)
              if (follower.AccountId) {
                const userIdRoom = String(follower.AccountId).trim().toLowerCase();
                io.to(userIdRoom).emit('new_notification', notificationPayload);
                console.log(`[LivestreamService] Emitted socket event to userId room: ${userIdRoom}`);
              }
              
              console.log(`[LivestreamService] Emitted socket event to EntityAccountId room: ${receiverRoom}`);
            }
          } catch (socketError) {
            console.error('[LivestreamService] Could not emit socket event for livestream notification:', socketError);
          }
          
          successCount++;
        } catch (notifError) {
          console.error(`[LivestreamService] Error creating notification for follower:`, notifError);
          console.error(`[LivestreamService] Error stack:`, notifError.stack);
          console.error(`[LivestreamService] Follower data:`, follower);
          errorCount++;
          // Continue với follower tiếp theo
        }
      }
      
      console.log(`[LivestreamService] Sent livestream notifications: ${successCount} success, ${errorCount} errors out of ${followers.length} followers`);
    }
  } catch (notifError) {
    console.error('[LivestreamService] Error sending livestream notifications:', notifError);
    // Không fail livestream creation nếu notification fail
  }

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

async function createScheduledLivestream(payload) {
  try {
    const {
      title,
      description = "",
      scheduledStartTime,
      settings = {},
      hostAccountId,
      entityAccountId,
      entityId,
      entityType,
    } = payload;

    console.log("[LivestreamService] createScheduledLivestream - Input:", {
      title,
      description,
      scheduledStartTime,
      hostAccountId,
      entityAccountId,
      entityId,
      entityType,
    });

    if (!title) {
      throw new Error("Title is required");
    }
    if (!hostAccountId) {
      throw new Error("Authentication required. Please login again.");
    }
    if (!scheduledStartTime) {
      throw new Error("Scheduled start time is required");
    }

    const scheduledTime = new Date(scheduledStartTime);
    if (isNaN(scheduledTime.getTime())) {
      throw new Error("Invalid scheduled start time format");
    }
    if (scheduledTime <= new Date()) {
      throw new Error("Scheduled start time must be in the future");
    }

    console.log("[LivestreamService] Resolving host entity...");
    const { hostEntityAccountId, hostEntityId, hostEntityType } = await resolveHostEntity({
      hostAccountId,
      entityAccountId,
      entityId,
      entityType,
    });

    console.log("[LivestreamService] Resolved host entity:", {
      hostEntityAccountId,
      hostEntityId,
      hostEntityType,
    });

    if (!hostEntityAccountId) {
      console.error("[LivestreamService] Failed to resolve EntityAccountId for hostAccountId:", hostAccountId);
      throw new Error("Could not determine EntityAccountId for livestream. Please ensure your account is properly set up.");
    }

    // Generate agora credentials now (will be used when activated)
    console.log("[LivestreamService] Generating Agora credentials...");
    const agoraCredentials = agoraService.getChannelCredentials(hostAccountId);

    console.log("[LivestreamService] Creating scheduled livestream in database...");
    const livestream = await livestreamRepository.createScheduled({
      hostAccountId,
      hostEntityAccountId,
      hostEntityId,
      hostEntityType,
      title,
      description,
      scheduledStartTime: scheduledTime,
      scheduledSettings: settings,
      agoraChannelName: agoraCredentials.channelName,
      agoraUid: agoraCredentials.uid,
    });

    console.log("[LivestreamService] Scheduled livestream created successfully:", livestream?.livestreamId);
    return { livestream, agora: agoraCredentials };
  } catch (err) {
    console.error("[LivestreamService] createScheduledLivestream error:", err);
    console.error("[LivestreamService] Error stack:", err.stack);
    throw err;
  }
}

async function getScheduledLivestreams(hostAccountId = null) {
  if (hostAccountId) {
    return await livestreamRepository.findScheduledByHost(hostAccountId);
  }
  return await livestreamRepository.findScheduled();
}

async function activateScheduledLivestream(livestreamId) {
  const livestream = await livestreamRepository.findById(livestreamId);
  if (!livestream) {
    throw new Error("Scheduled livestream not found");
  }
  if (livestream.status !== "scheduled") {
    throw new Error("Livestream is not scheduled");
  }

  // Ensure no parallel livestream
  await ensureNoParallelLivestream(livestream.hostAccountId, livestream.hostEntityAccountId);

  // Generate new agora credentials for activation
  const agoraCredentials = agoraService.getChannelCredentials(livestream.hostAccountId);

  const activated = await livestreamRepository.activateScheduled(livestreamId, agoraCredentials);

  return { livestream: activated, agora: agoraCredentials };
}

async function cancelScheduledLivestream(livestreamId, hostAccountId) {
  const livestream = await livestreamRepository.findById(livestreamId);
  if (!livestream) {
    throw new Error("Scheduled livestream not found");
  }
  if (livestream.hostAccountId !== hostAccountId) {
    const err = new Error("You do not have permission to cancel this scheduled livestream");
    err.status = 403;
    throw err;
  }
  if (livestream.status !== "scheduled") {
    const err = new Error("Only scheduled livestreams can be cancelled");
    err.status = 400;
    throw err;
  }

  const cancelled = await livestreamRepository.updateStatus(livestreamId, {
    status: "ended",
    endTime: new Date(),
  });

  return cancelled || livestream;
}

module.exports = {
  startLivestream,
  endLivestream,
  createScheduledLivestream,
  getScheduledLivestreams,
  activateScheduledLivestream,
  cancelScheduledLivestream,
};

