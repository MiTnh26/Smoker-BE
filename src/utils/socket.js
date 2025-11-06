// utils/socket.js
// Cấu hình và khởi tạo Socket.IO cho server Express

let ioInstance = null;

function initSocket(server) {
    const { Server } = require('socket.io');
    ioInstance = new Server(server, {
        cors: {
            origin: '*', // Cấu hình lại cho phù hợp với frontend
            methods: ['GET', 'POST']
        }
    });
    // Lắng nghe sự kiện join từ client để cho socket vào room userId
    ioInstance.on('connection', (socket) => {
        socket.on('join', (userId) => {
            socket.join(String(userId));
            // console.log('User', socket.id, 'joined room', userId);
        });
    });
    return ioInstance;
}

function getIO() {
    if (!ioInstance) {
        throw new Error('Socket.io chưa được khởi tạo!');
    }
    return ioInstance;
}

module.exports = {
    initSocket,
    getIO
};
