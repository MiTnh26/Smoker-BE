
require("dotenv").config();
const http = require("http");
const app = require("./src/app");

const port = process.env.PORT || 9999;
const host = process.env.HOSTNAME || "localhost";

// Create HTTP server for Socket.io
const server = http.createServer(app);


// Sử dụng utils/socket.js để khởi tạo socket.io
const { initSocket } = require("./src/utils/socket");
const io = initSocket(server);

server.listen(port, host, () => {
  console.log(`🚀 Server is running at http://${host}:${port}`);
});
