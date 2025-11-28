
require("dotenv").config();
const http = require("http");
const app = require("./src/app");

const port = process.env.PORT || 9999;
const host = process.env.HOST || "0.0.0.0";

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Sử dụng utils/socket.js để khởi tạo socket.io
const { initSocket } = require("./src/utils/socket");
const io = initSocket(server);

// Start server with error handling
server.listen(port, host, () => {
  console.log(`🚀 Server is running at http://${host}:${port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${port} is already in use`);
    console.log(`💡 Please stop the process using port ${port} and try again`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});
