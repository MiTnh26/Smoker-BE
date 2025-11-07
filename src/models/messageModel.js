const { getPool, sql } = require('../db/sqlserver');

// Thêm tin nhắn mới
async function addMessage(conversationId, senderId, content, messageType = 'text') {
    const pool = await getPool();
    // Insert message, không dùng OUTPUT
    await pool.request()
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('senderId', sql.UniqueIdentifier, senderId)
        .input('content', sql.NVarChar, content)
        .input('messageType', sql.NVarChar, messageType)
        .query(`INSERT INTO Messages (conversationId, senderId, content, messageType) VALUES (@conversationId, @senderId, @content, @messageType)`);
    // Lấy messageId vừa thêm
    const result = await pool.request().query(`SELECT TOP 1 * FROM Messages WHERE conversationId = '${conversationId}' AND senderId = '${senderId}' ORDER BY sentAt DESC`);
    return result.recordset[0];
}

// Lấy tin nhắn theo conversationId
async function getMessagesByConversation(conversationId, limit = 50, offset = 0) {
    const pool = await getPool();
    const result = await pool.request()
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit)
        .query(`SELECT * FROM Messages WHERE conversationId = @conversationId ORDER BY sentAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
    return result.recordset;
}

// Đánh dấu tin nhắn đã đọc
async function markMessagesAsRead(conversationId, userId) {
    const pool = await getPool();
    await pool.request()
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`UPDATE Messages SET isRead = 1 WHERE conversationId = @conversationId AND senderId <> @userId AND isRead = 0`);
}

module.exports = {
    addMessage,
    getMessagesByConversation,
    markMessagesAsRead
};
