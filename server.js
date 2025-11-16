
require("dotenv").config();
const http = require("http");

try {
  const app = require("./src/app");
  
  const port = process.env.PORT || 9999;
  const host = process.env.HOSTNAME || "0.0.0.0"; // Use 0.0.0.0 for Render
  
  // Create HTTP server for Socket.io
  const server = http.createServer(app);
  
  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });
  
  // Sử dụng utils/socket.js để khởi tạo socket.io
  try {
    const { initSocket } = require("./src/utils/socket");
    const io = initSocket(server);
    console.log('✅ Socket.io initialized');
  } catch (socketError) {
    console.warn('⚠️ Socket.io initialization failed:', socketError.message);
    // Continue without socket.io
  }
  
  server.listen(port, host, () => {
    console.log(`🚀 Server is running at http://${host}:${port}`);
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Failed to start server:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}
