const ROOM_PREFIX = "livestream:";

function buildRoomName(channelName) {
  return `${ROOM_PREFIX}${channelName}`;
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

  socket.on("chat-message", (payload = {}) => {
    const { channelName } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    io.to(room).emit("new-chat-message", payload);
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

