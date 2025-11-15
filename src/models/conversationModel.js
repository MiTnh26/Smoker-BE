const { getPool, sql } = require('../db/sqlserver');

// Tạo hoặc lấy cuộc trò chuyện giữa 2 user
async function findOrCreateConversation(participant1Id, participant2Id) {
    const pool = await getPool();
    const [p1, p2] = participant1Id < participant2Id ? [participant1Id, participant2Id] : [participant2Id, participant1Id];
    let result = await pool.request()
        .input('participant1Id', sql.UniqueIdentifier, p1)
        .input('participant2Id', sql.UniqueIdentifier, p2)
        .query('SELECT * FROM Conversations WHERE participant1Id = @participant1Id AND participant2Id = @participant2Id');
    if (result.recordset.length > 0) return result.recordset[0];
    let insert = await pool.request()
        .input('participant1Id', sql.UniqueIdentifier, p1)
        .input('participant2Id', sql.UniqueIdentifier, p2)
        .query('INSERT INTO Conversations (participant1Id, participant2Id) OUTPUT INSERTED.* VALUES (@participant1Id, @participant2Id)');
    return insert.recordset[0];
}


// Lấy danh sách cuộc trò chuyện của 1 user
async function getConversationsByUser(userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query('SELECT * FROM Conversations WHERE participant1Id = @userId OR participant2Id = @userId ORDER BY lastMessageAt DESC, createdAt DESC');
    return result.recordset;
}

// Lấy thông tin cuộc trò chuyện theo conversationId
async function getConversationById(conversationId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .query('SELECT * FROM Conversations WHERE conversationId = @conversationId');
    return result.recordset[0];
}

module.exports = {
    findOrCreateConversation,
    getConversationsByUser,
    getConversationById
};
