const ROOM_PREFIX = "livestream:";
const { getPool, sql } = require("../db/sqlserver");
const livestreamService = require("../services/livestreamService");

function buildRoomName(channelName) {
  return `${ROOM_PREFIX}${channelName}`;
}

/**
 * Lấy thông tin entity (name, avatar) từ EntityAccountId
 */
async function getEntityInfoByEntityAccountId(entityAccountId) {
  if (!entityAccountId) return null;
  
  try {
    const pool = await getPool();
    if (!pool) {
      console.warn("[LivestreamSocket] SQL pool not available");
      return null;
    }

    const result = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT 
          EA.EntityAccountId,
          EA.EntityType,
          EA.EntityId,
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

    if (result.recordset.length > 0) {
      const row = result.recordset[0];
      return {
        userName: row.UserName || 'Người dùng',
        userAvatar: row.Avatar || null,
      };
    }
    return null;
  } catch (error) {
    console.error("[LivestreamSocket] Error getting entity info:", error.message);
    return null;
  }
}

function emitViewerCount(io, room) {
  const roomInfo = io.sockets.adapter.rooms.get(room);
  if (!roomInfo) {
    io.to(room).emit("viewer-count-updated", { count: 0 });
    return;
  }
  
  // Đếm số viewer (loại bỏ broadcaster)
  let viewerCount = 0;
  for (const socketId of roomInfo) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && !socket.data?.isBroadcaster) {
      viewerCount++;
    }
  }
  
  console.log(`[LivestreamSocket] Room ${room} has ${viewerCount} viewers (total sockets: ${roomInfo.size})`);
  io.to(room).emit("viewer-count-updated", { count: viewerCount });
}

// Batch notification tracking per room
const batchNotificationQueues = new Map(); // room -> { count: number, timer: NodeJS.Timeout }

// Track users đã join để tránh duplicate notifications (shared across all sockets)
// Track theo entityAccountId vì nó unique hơn userId
const joinedUsers = new Map(); // room -> Set<entityAccountId>

// Track broadcaster sockets per channel để tự động end livestream khi disconnect
const broadcasterSockets = new Map(); // channelName -> Set<socketId>
const broadcasterTimeouts = new Map(); // channelName -> NodeJS.Timeout

function emitBatchJoinNotification(io, room, channelName, count) {
  if (count > 0) {
    io.to(room).emit("batch-users-joined", { 
      channelName,
      count,
      message: `${count} người đã tham gia`
    });
  }
}

function registerLivestreamSocket(socket, io) {
  // Lưu thông tin user cho mỗi socket để track
  socket.data = socket.data || {};
  
  socket.on("join-livestream", async (payload = {}) => {
    const { channelName, userId, isBroadcaster, entityAccountId } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    
    // Check xem socket đã join room này chưa (tránh duplicate join từ cùng socket)
    if (socket.rooms.has(room)) {
      console.log(`[LivestreamSocket] Socket ${socket.id} already in room ${room}, skipping`);
      return;
    }
    
    // Check xem user (entityAccountId) đã join room này chưa (tránh duplicate notifications)
    // Sử dụng entityAccountId vì nó unique hơn userId
    const userKey = entityAccountId || userId; // Fallback to userId nếu không có entityAccountId
    if (!joinedUsers.has(room)) {
      joinedUsers.set(room, new Set());
    }
    const roomUsers = joinedUsers.get(room);
    
    // Nếu user đã join rồi (từ socket khác), chỉ update data và skip notification
    const isAlreadyJoined = userKey && roomUsers.has(userKey);
    
    socket.data.channelName = channelName;
    socket.data.userId = userId;
    socket.data.isBroadcaster = isBroadcaster || false;
    socket.data.entityAccountId = entityAccountId;
    
    socket.join(room);
    
    // Track broadcaster socket để tự động end livestream khi disconnect
    if (isBroadcaster) {
      if (!broadcasterSockets.has(channelName)) {
        broadcasterSockets.set(channelName, new Set());
      }
      broadcasterSockets.get(channelName).add(socket.id);
      
      // Clear timeout nếu có (broadcaster đã reconnect)
      if (broadcasterTimeouts.has(channelName)) {
        clearTimeout(broadcasterTimeouts.get(channelName));
        broadcasterTimeouts.delete(channelName);
        console.log(`[LivestreamSocket] Broadcaster reconnected, cleared timeout for ${channelName}`);
      }
    }
    
    // Chỉ thêm vào set nếu chưa join và có userKey
    if (!isAlreadyJoined && userKey) {
      roomUsers.add(userKey);
    }
    
    console.log(`[LivestreamSocket] User ${userId} (entityAccountId: ${entityAccountId}) joined room ${room} (broadcaster: ${isBroadcaster || false}, alreadyJoined: ${isAlreadyJoined})`);
    
    // Nếu đã join rồi (từ socket khác), skip notification nhưng vẫn update viewer count
    if (isAlreadyJoined) {
      emitViewerCount(io, room);
      return;
    }
    
    // Lấy thông tin user để gửi notification (cho cả broadcaster và viewer)
    let userInfo = null;
    if (entityAccountId) {
      userInfo = await getEntityInfoByEntityAccountId(entityAccountId);
    }
    
    // Nếu không phải broadcaster và chưa join, gửi notification và xử lý batch
    // (Broadcaster cũng sẽ nhận được notifications này để thấy ai đã tham gia)
    if (!isBroadcaster && !isAlreadyJoined) {
      // Gửi notification cho user join (hiển thị trong chat)
      // Gửi cho tất cả mọi người trong room (bao gồm cả broadcaster)
      io.to(room).emit("user-joined", { 
        channelName,
        userId,
        userName: userInfo?.userName || "Người dùng",
        userAvatar: userInfo?.userAvatar || null,
        timestamp: new Date().toISOString()
      });
      
      // Batch notification: đếm số người join trong 3 giây (chỉ đếm viewers mới join, không tính broadcaster)
      if (!batchNotificationQueues.has(room)) {
        batchNotificationQueues.set(room, { count: 0, timer: null });
      }
      
      const queue = batchNotificationQueues.get(room);
      queue.count++;
      
      // Clear timer cũ nếu có
      if (queue.timer) {
        clearTimeout(queue.timer);
      }
      
      // Nếu đã đủ 10 người, gửi ngay
      if (queue.count >= 10) {
        emitBatchJoinNotification(io, room, channelName, queue.count);
        queue.count = 0;
      } else {
        // Đợi 3 giây, nếu có người join thì gửi batch
        queue.timer = setTimeout(() => {
          if (queue.count > 0) {
            emitBatchJoinNotification(io, room, channelName, queue.count);
            queue.count = 0;
          }
          batchNotificationQueues.delete(room);
        }, 3000);
      }
    }
    
    emitViewerCount(io, room);
  });

  socket.on("leave-livestream", async (payload = {}) => {
    const { channelName, userId } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    
    // Check xem socket có trong room không
    if (!socket.rooms.has(room)) {
      console.log(`[LivestreamSocket] Socket ${socket.id} not in room ${room}, skipping leave`);
      return;
    }
    
    socket.leave(room);
    
    // Check xem còn socket nào khác của user này trong room không
    const userKey = socket.data?.entityAccountId || socket.data?.userId || userId;
    let hasOtherSockets = false;
    
    if (userKey && joinedUsers.has(room)) {
      // Kiểm tra xem còn socket nào khác của user này trong room không
      const roomInfo = io.sockets.adapter.rooms.get(room);
      if (roomInfo) {
        for (const socketId of roomInfo) {
          const otherSocket = io.sockets.sockets.get(socketId);
          if (otherSocket && otherSocket.id !== socket.id) {
            const otherUserKey = otherSocket.data?.entityAccountId || otherSocket.data?.userId;
            if (otherUserKey === userKey) {
              hasOtherSockets = true;
              break;
            }
          }
        }
      }
      
      // Chỉ remove khỏi joinedUsers nếu không còn socket nào khác của user này
      if (!hasOtherSockets) {
        joinedUsers.get(room).delete(userKey);
      }
    }
    
    // Lấy thông tin user để gửi notification (nếu có)
    let userInfo = null;
    if (socket.data?.entityAccountId) {
      userInfo = await getEntityInfoByEntityAccountId(socket.data.entityAccountId);
    }
    
    // Nếu không phải broadcaster và không còn socket nào khác của user, gửi notification user left
    // (Broadcaster cũng sẽ nhận được notifications này)
    if (!socket.data?.isBroadcaster && !hasOtherSockets) {
      io.to(room).emit("user-left", { 
        channelName,
        userId: userId || socket.data?.userId,
        userName: userInfo?.userName || "Người dùng",
        userAvatar: userInfo?.userAvatar || null,
        timestamp: new Date().toISOString()
      });
    }
    
    emitViewerCount(io, room);
  });

  socket.on("chat-message", async (payload = {}) => {
    const { channelName, entityAccountId, userId, userName, userAvatar } = payload;
    if (!channelName) {
      return;
    }
    
    const room = buildRoomName(channelName);
    
    // Nếu có entityAccountId, lấy thông tin từ database để đảm bảo đúng activeEntity
    let finalUserName = userName || "User";
    let finalUserAvatar = userAvatar || "";
    
    if (entityAccountId) {
      const entityInfo = await getEntityInfoByEntityAccountId(entityAccountId);
      if (entityInfo) {
        finalUserName = entityInfo.userName;
        finalUserAvatar = entityInfo.userAvatar || "";
      }
    }
    
    // Gửi message với thông tin đã được enrich từ activeEntity
    io.to(room).emit("new-chat-message", {
      ...payload,
      userName: finalUserName,
      userAvatar: finalUserAvatar,
    });
  });

  socket.on("disconnecting", async () => {
    // Khi socket disconnect, tự động leave tất cả livestream rooms
    for (const room of socket.rooms) {
      if (room.startsWith(ROOM_PREFIX)) {
        console.log(`[LivestreamSocket] Socket ${socket.id} disconnecting from room ${room}`);
        
        const channelName = socket.data?.channelName || room.replace(ROOM_PREFIX, '');
        const userKey = socket.data?.entityAccountId || socket.data?.userId;
        const isBroadcaster = socket.data?.isBroadcaster || false;
        
        // Nếu là broadcaster, remove khỏi broadcasterSockets và end livestream ngay lập tức
        if (isBroadcaster && channelName && broadcasterSockets.has(channelName)) {
          broadcasterSockets.get(channelName).delete(socket.id);
          
          // Nếu không còn broadcaster socket nào, end livestream ngay lập tức
          if (broadcasterSockets.get(channelName).size === 0) {
            broadcasterSockets.delete(channelName);
            
            // Clear timeout cũ nếu có
            if (broadcasterTimeouts.has(channelName)) {
              clearTimeout(broadcasterTimeouts.get(channelName));
              broadcasterTimeouts.delete(channelName);
            }
            
            // End livestream ngay lập tức (không chờ timeout)
            (async () => {
              try {
                console.log(`[LivestreamSocket] Auto-ending livestream ${channelName} immediately after broadcaster disconnect`);
                
                // Tìm livestreamId từ channelName
                const livestreamRepository = require("../repositories/livestreamRepository");
                const livestream = await livestreamRepository.findByChannel(channelName);
                
                if (!livestream) {
                  console.warn(`[LivestreamSocket] Livestream not found for channel ${channelName}, emitting ended event anyway`);
                  // Vẫn emit event để viewers biết livestream đã kết thúc
                  io.to(room).emit("livestream-ended", {
                    channelName,
                    message: "Livestream đã kết thúc"
                  });
                  return;
                }
                
                console.log(`[LivestreamSocket] Found livestream ${livestream.livestreamId} for channel ${channelName}, current status: ${livestream.status}`);
                
                if (livestream.status === "live") {
                  // End livestream và update status trong DB ngay lập tức
                  try {
                    await livestreamService.endLivestream(livestream.livestreamId, livestream.hostAccountId);
                    console.log(`[LivestreamSocket] Successfully auto-ended livestream ${livestream.livestreamId} (status: ended)`);
                  } catch (endError) {
                    console.error(`[LivestreamSocket] Error calling endLivestream service:`, endError);
                    // Nếu không thể end qua service, thử update trực tiếp
                    try {
                      await livestreamRepository.updateStatus(livestream.livestreamId, {
                        status: "ended",
                        endTime: new Date(),
                      });
                      console.log(`[LivestreamSocket] Updated livestream status directly to ended`);
                    } catch (updateError) {
                      console.error(`[LivestreamSocket] Error updating status directly:`, updateError);
                    }
                  }
                } else {
                  console.log(`[LivestreamSocket] Livestream ${livestream.livestreamId} already ended (status: ${livestream.status})`);
                }
                
                // Emit event để thông báo cho tất cả viewers
                io.to(room).emit("livestream-ended", {
                  channelName,
                  message: "Livestream đã kết thúc"
                });
                
                // Emit global event để feed refresh ngay lập tức
                io.emit("livestream-status-changed", {
                  livestreamId: livestream.livestreamId,
                  status: "ended",
                  channelName
                });
              } catch (error) {
                console.error(`[LivestreamSocket] Error auto-ending livestream ${channelName}:`, error);
                // Vẫn emit event để viewers biết livestream đã kết thúc
                io.to(room).emit("livestream-ended", {
                  channelName,
                  message: "Livestream đã kết thúc"
                });
              }
            })();
          }
        }
        
        // Check xem còn socket nào khác của user này trong room không
        let hasOtherSockets = false;
        if (userKey && joinedUsers.has(room)) {
          const roomInfo = io.sockets.adapter.rooms.get(room);
          if (roomInfo) {
            for (const socketId of roomInfo) {
              const otherSocket = io.sockets.sockets.get(socketId);
              if (otherSocket && otherSocket.id !== socket.id) {
                const otherUserKey = otherSocket.data?.entityAccountId || otherSocket.data?.userId;
                if (otherUserKey === userKey) {
                  hasOtherSockets = true;
                  break;
                }
              }
            }
          }
          
          // Chỉ remove khỏi joinedUsers nếu không còn socket nào khác của user này
          if (!hasOtherSockets) {
            joinedUsers.get(room).delete(userKey);
          }
        }
        
        socket.leave(room);
        
        // Lấy thông tin user để gửi notification (nếu có)
        let userInfo = null;
        if (socket.data?.entityAccountId) {
          userInfo = await getEntityInfoByEntityAccountId(socket.data.entityAccountId);
        }
        
        // Nếu không phải broadcaster và không còn socket nào khác của user, gửi notification user left
        if (!isBroadcaster && userKey && !hasOtherSockets) {
          io.to(room).emit("user-left", { 
            channelName,
            userId: socket.data?.userId || userKey,
            userName: userInfo?.userName || "Người dùng",
            userAvatar: userInfo?.userAvatar || null,
            timestamp: new Date().toISOString()
          });
        }
        
        emitViewerCount(io, room);
      }
    }
  });
  
  socket.on("disconnect", () => {
    // Đảm bảo cleanup khi disconnect hoàn toàn
    console.log(`[LivestreamSocket] Socket ${socket.id} disconnected`);
  });
}

module.exports = registerLivestreamSocket;

