
require("dotenv").config();
const http = require("http");
const app = require("./src/app");

const port = process.env.PORT || 9999;
const host = process.env.HOSTNAME || "localhost";

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  // Join a livestream channel
  socket.on("join-livestream", ({ channelName, userId }) => {
    socket.join(channelName);
    console.log(`📺 User ${userId} joined livestream: ${channelName}`);
    
    // Notify others about new viewer
    socket.to(channelName).emit("user-joined", { userId, socketId: socket.id });
  });

  // Leave a livestream channel
  socket.on("leave-livestream", ({ channelName, userId }) => {
    socket.leave(channelName);
    console.log(`📺 User ${userId} left livestream: ${channelName}`);
    
    // Notify others about viewer leaving
    socket.to(channelName).emit("user-left", { userId, socketId: socket.id });
  });

  // Send chat message
  socket.on("chat-message", ({ channelName, message, userId, userName, userAvatar }) => {
    const chatData = {
      message,
      userId,
      userName,
      userAvatar,
      timestamp: new Date().toISOString(),
    };
    
    // Broadcast to all in the channel including sender
    io.to(channelName).emit("new-chat-message", chatData);
    console.log(`💬 Chat message in ${channelName}:`, message);
  });

  // Send reaction
  socket.on("reaction", ({ channelName, reaction, userId, userName }) => {
    const reactionData = {
      reaction,
      userId,
      userName,
      timestamp: new Date().toISOString(),
    };
    
    // Broadcast to all except sender
    socket.to(channelName).emit("new-reaction", reactionData);
    console.log(`🎭 Reaction in ${channelName}: ${reaction} from ${userName}`);
  });

  // Update viewer count
  socket.on("update-viewer-count", ({ channelName, count }) => {
    socket.to(channelName).emit("viewer-count-updated", { count });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("🔌 User disconnected:", socket.id);
  });
});

// Export io for use in other parts of the application
app.set("io", io);

server.listen(port, host, () => {
  console.log(`🚀 Server is running at http://${host}:${port}`);
});
