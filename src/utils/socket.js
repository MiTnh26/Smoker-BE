// utils/socket.js
// Cấu hình và khởi tạo Socket.IO cho server Express

let ioInstance = null;

function initSocket(server) {
    const { Server } = require('socket.io');
    ioInstance = new Server(server, {
        path: "/api/socket.io", 
        cors: {
            origin: '*', // Cấu hình lại cho phù hợp với frontend
            methods: ['GET', 'POST']
        }
    });
    // Lắng nghe sự kiện join từ client để cho socket vào room userId
    ioInstance.on('connection', (socket) => {
        console.log('=== SOCKET CONNECTION ===');
        console.log('Socket connected:', socket.id);
        
        // Join user room (for notifications)
        socket.on('join', (userId) => {
            const roomId = String(userId);
            socket.join(roomId);
            console.log('User', socket.id, 'joined room:', roomId);
        });
        
        // Join conversation room (for realtime chat - like Messenger)
        socket.on('join_conversation', (conversationId) => {
            const conversationRoom = `conversation:${conversationId}`;
            socket.join(conversationRoom);
            console.log('Socket', socket.id, 'joined conversation room:', conversationRoom);
        });
        
        // Leave conversation room
        socket.on('leave_conversation', (conversationId) => {
            const conversationRoom = `conversation:${conversationId}`;
            socket.leave(conversationRoom);
            console.log('Socket', socket.id, 'left conversation room:', conversationRoom);
        });
        
        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
        });
        console.log('========================');
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
