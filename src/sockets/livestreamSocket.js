const ROOM_PREFIX = "livestream:";
const { getPool, sql } = require("../db/sqlserver");

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

function registerLivestreamSocket(socket, io) {
  // Lưu thông tin user cho mỗi socket để track
  socket.data = socket.data || {};
  
  socket.on("join-livestream", (payload = {}) => {
    const { channelName, userId, isBroadcaster } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    socket.data.channelName = channelName;
    socket.data.userId = userId;
    socket.data.isBroadcaster = isBroadcaster || false;
    
    socket.join(room);
    console.log(`[LivestreamSocket] User ${userId} joined room ${room} (broadcaster: ${isBroadcaster || false})`);
    io.to(room).emit("user-joined", { userId });
    emitViewerCount(io, room);
  });

  socket.on("leave-livestream", (payload = {}) => {
    const { channelName, userId } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    socket.leave(room);
    io.to(room).emit("user-left", { userId });
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

  socket.on("disconnecting", () => {
    // Khi socket disconnect, tự động leave tất cả livestream rooms
    for (const room of socket.rooms) {
      if (room.startsWith(ROOM_PREFIX)) {
        console.log(`[LivestreamSocket] Socket ${socket.id} disconnecting from room ${room}`);
        socket.leave(room);
        io.to(room).emit("user-left", { userId: socket.id });
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

