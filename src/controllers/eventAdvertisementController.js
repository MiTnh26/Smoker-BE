const EventAdvertisement = require("../models/eventAdvertisementModel");
const NotificationService = require("../services/notificationService");
const { getPool, sql } = require("../db/sqlserver");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

class EventAdvertisementController {
  // Tạo request quảng cáo event
  async createAdvertisement(req, res) {
    try {
      const { eventId, eventTitle, eventDescription, barId, pictureEvent, eventUrl } = req.body;
      const senderAccountId = req.user?.id;

      // Validate
      if (!eventId || !eventTitle || !barId) {
        return res.status(400).json({
          success: false,
          message: "Thiếu thông tin bắt buộc: eventId, eventTitle, barId",
        });
      }

      if (!senderAccountId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // Lấy barName từ database
      let barName = "Unknown Bar";
      try {
        const pool = await getPool();
        const result = await pool.request()
          .input("BarPageId", sql.UniqueIdentifier, barId)
          .query(`SELECT TOP 1 BarName FROM BarPages WHERE BarPageId = @BarPageId`);
        
        if (result.recordset.length > 0) {
          barName = result.recordset[0].BarName || barName;
        }
      } catch (err) {
        console.warn("Could not get bar name:", err.message);
      }

      // Lấy senderEntityAccountId
      const senderEntityAccountId = await getEntityAccountIdByAccountId(senderAccountId);
      if (!senderEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "Không tìm thấy EntityAccountId của người gửi",
        });
      }

      // Tạo expiresAt = 30 ngày từ bây giờ
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Lưu thông tin quảng cáo vào MongoDB
      const advertisement = new EventAdvertisement({
        eventId,
        eventTitle,
        eventDescription: eventDescription || "",
        barId,
        barName,
        pictureEvent: pictureEvent || "",
        eventUrl: eventUrl || "",
        status: "pending",
        expiresAt,
      });

      await advertisement.save();

      // Lấy admin EntityAccountId (giả sử admin có role "ADMIN" hoặc có thể lấy từ config)
      // Tạm thời dùng cách tìm account có role ADMIN
      let adminEntityAccountId = null;
      try {
        const pool = await getPool();
        const adminResult = await pool.request()
          .query(`SELECT TOP 1 EntityAccountId FROM EntityAccounts WHERE EntityType = 'Account' 
                  AND EntityId IN (SELECT AccountId FROM Accounts WHERE Role = 'ADMIN')`);
        
        if (adminResult.recordset.length > 0) {
          adminEntityAccountId = adminResult.recordset[0].EntityAccountId;
        }
      } catch (err) {
        console.warn("Could not get admin EntityAccountId:", err.message);
      }

      // Gửi notification cho admin
      if (adminEntityAccountId) {
        const notificationContent = `${barName} đã đăng ký quảng cáo cho sự kiện "${eventTitle}"`;
        
        await NotificationService.createNotification({
          type: "Confirm",
          sender: senderAccountId,
          senderEntityAccountId: senderEntityAccountId,
          senderEntityType: "BarPage",
          receiver: null, // Admin account ID nếu có
          receiverEntityAccountId: adminEntityAccountId,
          receiverEntityType: "Account",
          content: notificationContent,
          link: `/admin/event-advertisements/${advertisement._id}`,
        });
      }

      res.status(201).json({
        success: true,
        message: "Đã gửi yêu cầu quảng cáo thành công",
        data: advertisement,
      });
    } catch (error) {
      console.error("Create advertisement error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi tạo yêu cầu quảng cáo",
        error: error.message,
      });
    }
  }

  // Lấy danh sách quảng cáo (cho admin)
  async getAdvertisements(req, res) {
    try {
      const { status } = req.query;
      const query = status ? { status } : {};
      
      const advertisements = await EventAdvertisement.find(query)
        .sort({ createdAt: -1 })
        .limit(100);

      res.json({
        success: true,
        data: advertisements,
      });
    } catch (error) {
      console.error("Get advertisements error:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi server khi lấy danh sách quảng cáo",
        error: error.message,
      });
    }
  }
}

module.exports = new EventAdvertisementController();

