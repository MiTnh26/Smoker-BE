const ROOM_PREFIX = "livestream:";

function buildRoomName(channelName) {
  return `${ROOM_PREFIX}${channelName}`;
}

function emitViewerCount(io, room) {
  const roomInfo = io.sockets.adapter.rooms.get(room);
  const count = roomInfo ? roomInfo.size : 0;
  io.to(room).emit("viewer-count-updated", { count });
}

function registerLivestreamSocket(socket, io) {
  socket.on("join-livestream", (payload = {}) => {
    const { channelName, userId } = payload;
    if (!channelName) {
      return;
    }
    const room = buildRoomName(channelName);
    socket.join(room);
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
    for (const room of socket.rooms) {
      if (room.startsWith(ROOM_PREFIX)) {
        io.to(room).emit("user-left", { userId: socket.id });
        emitViewerCount(io, room);
      }
    }
  });
}

module.exports = registerLivestreamSocket;

