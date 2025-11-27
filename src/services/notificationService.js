const Notification = require('../models/notificationModel');
const { getPool, sql } = require('../db/sqlserver');

class NotificationService {

  /**
   * Lấy danh sách thông báo và làm giàu dữ liệu với thông tin người gửi.
   * @param {string} entityAccountId - ID của người nhận thông báo.
   * @param {object} pagination - Tùy chọn phân trang { page, limit }.
   * @returns {Promise<object>} - Danh sách thông báo đã được làm giàu và thông tin phân trang.
   */
  async getEnrichedNotifications(entityAccountId, { page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    // 1. Lấy thông báo từ MongoDB
    const notifications = await Notification.find({
      receiverEntityAccountId: entityAccountId,
      type: { $ne: "Messages" } 
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean(); // Sử dụng lean() để có object thuần túy, nhanh hơn

    if (notifications.length === 0) {
      return { notifications: [], total: 0 };
    }
    
    // 2. Thu thập ID của người gửi
    const senderIds = [...new Set(notifications
        .map(n => n.senderEntityAccountId)
        .filter(Boolean)
    )];

    let senderInfoMap = new Map();

    // 3. Lấy thông tin người gửi từ SQL Server
    if (senderIds.length > 0) {
      try {
        const pool = await getPool();
        const placeholders = senderIds.map((_, i) => `@id${i}`).join(',');
        const request = pool.request();
        senderIds.forEach((id, i) => request.input(`id${i}`, sql.UniqueIdentifier, id));

        const result = await request.query(`
          SELECT 
            EA.EntityAccountId,
            CASE 
              WHEN EA.EntityType = 'Account' THEN A.UserName
              WHEN EA.EntityType = 'BarPage' THEN BP.BarName
              WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
              ELSE NULL
            END AS name,
            CASE 
              WHEN EA.EntityType = 'Account' THEN A.Avatar
              WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
              WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
              ELSE NULL
            END AS avatar
          FROM EntityAccounts EA
          LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
          LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
          LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
          WHERE EA.EntityAccountId IN (${placeholders})
        `);

        result.recordset.forEach(row => {
          senderInfoMap.set(String(row.EntityAccountId), {
            name: row.name || 'Một người dùng',
            avatar: row.avatar
          });
        });
    } catch (error) {
        console.error('[NotificationService] Error fetching sender info:', error);
    }
  }

    // 4. Gắn thông tin người gửi vào thông báo
    const enrichedNotifications = notifications.map(n => {
      const senderInfo = senderInfoMap.get(String(n.senderEntityAccountId));
      return {
        ...n,
        sender: senderInfo || { name: 'Một người dùng', avatar: null }
        };
    });

    // 5. Lấy tổng số thông báo để phân trang
    const total = await Notification.countDocuments({
      receiverEntityAccountId: entityAccountId,
      type: { $ne: "Messages" }
      });

    return { notifications: enrichedNotifications, total };
  }
}

module.exports = new NotificationService();
