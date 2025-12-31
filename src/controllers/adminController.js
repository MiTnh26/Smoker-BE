
const { getPool, sql } = require("../db/sqlserver");
const Song = require("../models/songModel");

async function getStats(req, res) {
  try {
    const pool = await getPool();

    // SQL counts
    const [{ recordset: usersRs }, { recordset: barsRs }, { recordset: eventsRs }, { recordset: reportsPendingRs }] = await Promise.all([
      pool.request().query("SELECT COUNT(1) AS cnt FROM Accounts"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM BarPages"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM Events"),
      pool.request().query("SELECT COUNT(1) AS cnt FROM Reports WHERE Status = 'Pending'")
    ]);

    // Mongo counts
    const songsCnt = await Song.countDocuments({});

    return res.json({
      success: true,
      data: {
        users: usersRs?.[0]?.cnt || 0,
        bars: barsRs?.[0]?.cnt || 0,
        events: eventsRs?.[0]?.cnt || 0,
        songs: songsCnt || 0,
        reportsPending: reportsPendingRs?.[0]?.cnt || 0,
      }
    });
  } catch (err) {
    console.error("[AdminController] getStats error:", err);
    return res.status(500).json({ success: false, message: "Failed to load stats" });
  }
}

async function listUsers(req, res) {
  try {
    const { q = "", role = "", status = "", page = 1, pageSize = 20 } = req.query;
    const { listAccounts } = require("../models/accountModel");
    const data = await listAccounts({ query: q, role, status, page: Number(page), pageSize: Number(pageSize) });
    return res.json({ success: true, ...data });
  } catch (err) {
    console.error("[AdminController] listUsers error:", err);
    return res.status(500).json({ success: false, message: "Failed to load users" });
  }
}

async function getPendingRegistrations(req, res) {
  try {
    const pool = await getPool();
    const [businesses, bars] = await Promise.all([
      pool.request().query(`
        SELECT
          ba.BussinessAccountId AS id,
          ba.UserName AS name,
          'BusinessAccount' AS type,
          ba.Role AS role,
          acc.Email AS ownerEmail,
          acc.UserName AS ownerName,
          ba.created_at AS createdAt
        FROM BussinessAccounts ba
        JOIN Accounts acc ON ba.AccountId = acc.AccountId
        WHERE ba.Status = 'pending'
      `),
      pool.request().query(`
        SELECT
          bp.BarPageId AS id,
          bp.BarName AS name,
          'BarPage' AS type,
          bp.Role AS role,
          acc.Email AS ownerEmail,
          acc.UserName AS ownerName,
          bp.created_at AS createdAt
        FROM BarPages bp
        JOIN Accounts acc ON bp.AccountId = acc.AccountId
        WHERE bp.Status = 'pending'
      `)
    ]);

    const data = [...(businesses.recordset || []), ...(bars.recordset || [])];
    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest first

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[AdminController] getPendingRegistrations error:", err);
    return res.status(500).json({ success: false, message: "Failed to load pending registrations" });
  }
}

async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ success: false, message: "status is required" });
    const { updateAccountStatus } = require("../models/accountModel");
    const u = await updateAccountStatus(id, status);
    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: u });
  } catch (err) {
    console.error("[AdminController] updateUserStatus error:", err);
    return res.status(500).json({ success: false, message: "Failed to update status" });
  }
}

async function updateUserRole(req, res) {
  try {
    // Kiểm tra xem user hiện tại có phải là Manager (từ bảng Managers) không
    // Manager không được phép đổi role
    const userType = req.user?.type; // "manager" hoặc undefined
    if (userType === "manager") {
      return res.status(403).json({ 
        success: false, 
        message: "Manager không được phép đổi role của người dùng" 
      });
    }

    const { id } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ success: false, message: "role is required" });

    // Chỉ cho phép 'Admin' hoặc 'Customer' ở bảng Accounts
    const allowed = new Set(["Admin", "Customer"]);
    if (!allowed.has(role)) {
      return res.status(400).json({ success: false, message: "role must be 'Admin' or 'Customer'" });
    }

    const { updateAccountRole } = require("../models/accountModel");
    const u = await updateAccountRole(id, role);
    if (!u) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: u });
  } catch (err) {
    console.error("[AdminController] updateUserRole error:", err);
    return res.status(500).json({ success: false, message: "Failed to update role" });
  }
}

async function updateBusinessStatus(req, res){
  try{
    const { id } = req.params; // BussinessAccountId
    const { status } = req.body || {};
    if(!status) return res.status(400).json({ success:false, message:"status is required"});
    const { updateBusinessStatus } = require("../models/businessAccountModel");
    const r = await updateBusinessStatus(id, status);
    if(!r) return res.status(404).json({ success:false, message:"Business not found"});
    return res.json({ success:true, data:r });
  }catch(err){
    console.error("[AdminController] updateBusinessStatus error:", err);
    return res.status(500).json({ success:false, message:"Failed to update business status"});
  }
}

// Admin-only: list businesses of an AccountId (no changes to user code)
async function getUserBusinesses(req, res){
  try{
    const { id } = req.params; // AccountId (uniqueidentifier)
    const pool = await getPool();

    // Lấy thực thể gắn với Account thông qua EntityAccounts
    const requestBA = pool.request().input("AccountId", sql.UniqueIdentifier, id);
    const requestBars = pool.request().input("AccountId", sql.UniqueIdentifier, id);

    const [ba, bars] = await Promise.all([
      requestBA.query(`
        SELECT 
          ba.BussinessAccountId AS id,
          ba.UserName AS name,
          ba.Role AS role,
          ba.Avatar AS avatar,
          ba.Status AS status,
          ea.EntityAccountId,
          'BusinessAccount' AS type
        FROM EntityAccounts ea
        INNER JOIN BussinessAccounts ba ON ba.BussinessAccountId = ea.EntityId
        WHERE ea.AccountId = @AccountId AND ea.EntityType = 'BusinessAccount'
        ORDER BY ba.UserName ASC
      `),
      requestBars.query(`
        SELECT 
          b.BarPageId AS id,
          b.BarName AS name,
          b.Role AS role,
          b.Avatar AS avatar,
          b.Status AS status,
          ea.EntityAccountId,
          'BarPage' AS type
        FROM EntityAccounts ea
        INNER JOIN BarPages b ON b.BarPageId = ea.EntityId
        WHERE ea.AccountId = @AccountId AND ea.EntityType = 'BarPage'
        ORDER BY b.BarName ASC
      `)
    ]);

    const data = [
      ...(ba.recordset || []),
      ...(bars.recordset || []),
    ];

    return res.json({ success:true, data });
  }catch(err){
    console.error("[AdminController] getUserBusinesses error:", err);
    return res.status(500).json({ success:false, message:"Failed to load businesses"});
  }
}

async function updateBarStatus(req, res){
  try{
    const { id } = req.params; // BarPageId
    const { status } = req.body || {};
    if(!status) return res.status(400).json({ success:false, message:"status is required"});
    const pool = await getPool();
    const rs = await pool.request()
      .input("id", sql.UniqueIdentifier, id)
      .input("Status", sql.NVarChar(20), status)
      .query(`
        UPDATE BarPages SET Status=@Status WHERE BarPageId=@id;
        SELECT BarPageId AS id, BarName AS name, Role, Status FROM BarPages WHERE BarPageId=@id;
      `);
    const row = rs.recordset?.[0];
    if(!row) return res.status(404).json({ success:false, message:"Bar not found"});
    return res.json({ success:true, data: row });
  }catch(err){
    console.error("[AdminController] updateBarStatus error:", err);
    return res.status(500).json({ success:false, message:"Failed to update bar status"});
  }
}

async function getRefundRequests(req, res) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const bookedScheduleModel = require("../models/bookedScheduleModel");
    const DetailSchedule = require("../models/detailSchedule");
    const BarReview = require("../models/barReviewModel");
    const UserReview = require("../models/userReviewModel");
    const { getPool, sql } = require("../db/sqlserver");
    const pool = await getPool();

    // Lấy danh sách bookings có RefundStatus = 'Pending' hoặc 'Finished'
    // Lấy cả Pending và Finished để hiển thị 2 phần riêng biệt
    const pendingBookings = await bookedScheduleModel.getBookedSchedulesByRefundStatus('Pending', { 
      limit: parseInt(limit) * 2, // Lấy nhiều hơn để có thể có cả Finished
      offset: 0 
    });
    
    const finishedBookings = await bookedScheduleModel.getBookedSchedulesByRefundStatus('Finished', { 
      limit: parseInt(limit) * 2, 
      offset: 0 
    });
    
    // Gộp 2 danh sách lại
    const bookings = [...pendingBookings, ...finishedBookings];

    // Populate thông tin chi tiết cho mỗi booking
    const bookingsWithDetails = await Promise.all(
      bookings.map(async (booking) => {
        // Populate detailSchedule từ MongoDB
        let detailSchedule = null;
        if (booking.MongoDetailId) {
          try {
            detailSchedule = await DetailSchedule.findById(booking.MongoDetailId);
            if (detailSchedule) {
              detailSchedule = detailSchedule.toObject ? detailSchedule.toObject() : detailSchedule;
            }
          } catch (error) {
            console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
          }
        }

        // Lấy review dựa trên Type và BookingId
        let review = null;
        const bookingId = booking.BookedScheduleId?.toString().toLowerCase().trim();
        
        if (booking.Type === 'BarTable') {
          // Tìm BarReview theo BookingId
          try {
            const barReview = await BarReview.findOne({
              where: {
                BookingId: bookingId
              }
            });
            if (barReview) {
              // Attach reviewer info
              const accountId = barReview.AccountId;
              const accountResult = await pool.request()
                .input("AccountId", sql.UniqueIdentifier, accountId)
                .query(`SELECT AccountId, UserName, Avatar FROM Accounts WHERE AccountId = @AccountId`);
              const account = accountResult.recordset[0];
              
              review = {
                type: 'BarReview',
                reviewId: barReview.BarReviewId,
                star: barReview.Star,
                content: barReview.Content,
                picture: barReview.Picture,
                feedbackContent: barReview.FeedBackContent,
                bookingId: barReview.BookingId,
                bookingDate: barReview.BookingDate,
                tableName: barReview.TableName,
                reviewer: account ? {
                  accountId: account.AccountId,
                  userName: account.UserName,
                  avatar: account.Avatar
                } : null,
                createdAt: barReview.created_at
              };
            }
          } catch (error) {
            console.error(`Error fetching BarReview for ${bookingId}:`, error);
          }
        } else if (booking.Type === 'DJ' || booking.Type === 'Dancer') {
          // Tìm UserReview theo BookingId hoặc BookedScheduleId
          try {
            const userReview = await UserReview.findOne({
              where: {
                BookingId: bookingId
              }
            });
            if (userReview) {
              // Attach reviewer info
              const accountId = userReview.AccountId;
              const accountResult = await pool.request()
                .input("AccountId", sql.UniqueIdentifier, accountId)
                .query(`SELECT AccountId, UserName, Avatar FROM Accounts WHERE AccountId = @AccountId`);
              const account = accountResult.recordset[0];
              
              review = {
                type: 'UserReview',
                reviewId: userReview.ReviewId,
                starValue: userReview.StarValue,
                content: userReview.Content,
                picture: userReview.Picture,
                feedbackContent: userReview.FeedBackContent,
                bookingId: userReview.BookingId,
                bookingDate: userReview.BookingDate,
                reviewer: account ? {
                  accountId: account.AccountId,
                  userName: account.UserName,
                  avatar: account.Avatar
                } : null,
                createdAt: userReview.created_at
              };
            }
          } catch (error) {
            console.error(`Error fetching UserReview for ${bookingId}:`, error);
          }
        }

        // Lấy thông tin booker và receiver (bao gồm AccountId)
        let booker = null;
        let receiver = null;
        let depositAmount = null;
        
        if (booking.BookerId) {
          try {
            const bookerResult = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, booking.BookerId)
              .query(`
                SELECT 
                  ea.EntityAccountId,
                  ea.EntityType,
                  ea.EntityId,
                  ea.AccountId,
                  CASE 
                    WHEN ea.EntityType = 'BusinessAccount' THEN ba.UserName
                    WHEN ea.EntityType = 'BarPage' THEN bp.BarName
                    WHEN ea.EntityType = 'Account' THEN acc.UserName
                    ELSE NULL
                  END AS Name,
                  CASE 
                    WHEN ea.EntityType = 'BusinessAccount' THEN ba.Avatar
                    WHEN ea.EntityType = 'BarPage' THEN bp.Avatar
                    WHEN ea.EntityType = 'Account' THEN acc.Avatar
                    ELSE NULL
                  END AS Avatar
                FROM EntityAccounts ea
                LEFT JOIN BussinessAccounts ba ON ba.BussinessAccountId = ea.EntityId AND ea.EntityType = 'BusinessAccount'
                LEFT JOIN BarPages bp ON bp.BarPageId = ea.EntityId AND ea.EntityType = 'BarPage'
                LEFT JOIN Accounts acc ON acc.AccountId = ea.AccountId AND ea.EntityType = 'Account'
                WHERE ea.EntityAccountId = @EntityAccountId
              `);
            booker = bookerResult.recordset[0] || null;
          } catch (error) {
            console.error(`Error fetching booker info:`, error);
          }
        }
        
        // Tính số tiền hoàn dựa trên Type và số lượng bàn
        try {
          const DEPOSIT_PER_DJ_DANCER = 100000; // 100.000 VND cho DJ/Dancer
          const DEPOSIT_PER_TABLE = 100000; // 100.000 VND mỗi bàn
          
          if (booking.Type === 'DJ' || booking.Type === 'Dancer') {
            // DJ/Dancer: cố định 100.000 VND
            depositAmount = DEPOSIT_PER_DJ_DANCER;
          } else if (booking.Type === 'BarTable') {
            // BarTable: số lượng bàn × 100.000 VND
            let tableCount = 0;
            if (detailSchedule && detailSchedule.Table) {
              // detailSchedule.Table có thể là Map hoặc Object
              if (detailSchedule.Table instanceof Map) {
                tableCount = detailSchedule.Table.size;
              } else if (typeof detailSchedule.Table === 'object') {
                // Nếu là Mongoose document, convert sang object
                const tableObj = detailSchedule.Table.toObject ? detailSchedule.Table.toObject() : detailSchedule.Table;
                tableCount = Object.keys(tableObj || {}).length;
              }
            }
            depositAmount = tableCount * DEPOSIT_PER_TABLE;
          }
        } catch (error) {
          console.error(`Error calculating deposit amount:`, error);
        }

        if (booking.ReceiverId) {
          try {
            const receiverResult = await pool.request()
              .input("EntityAccountId", sql.UniqueIdentifier, booking.ReceiverId)
              .query(`
                SELECT 
                  ea.EntityAccountId,
                  ea.EntityType,
                  ea.EntityId,
                  CASE 
                    WHEN ea.EntityType = 'BusinessAccount' THEN ba.UserName
                    WHEN ea.EntityType = 'BarPage' THEN bp.BarName
                    ELSE NULL
                  END AS Name,
                  CASE 
                    WHEN ea.EntityType = 'BusinessAccount' THEN ba.Avatar
                    WHEN ea.EntityType = 'BarPage' THEN bp.Avatar
                    ELSE NULL
                  END AS Avatar
                FROM EntityAccounts ea
                LEFT JOIN BussinessAccounts ba ON ba.BussinessAccountId = ea.EntityId AND ea.EntityType = 'BusinessAccount'
                LEFT JOIN BarPages bp ON bp.BarPageId = ea.EntityId AND ea.EntityType = 'BarPage'
                WHERE ea.EntityAccountId = @EntityAccountId
              `);
            receiver = receiverResult.recordset[0] || null;
          } catch (error) {
            console.error(`Error fetching receiver info:`, error);
          }
        }

        return {
          ...booking,
          detailSchedule,
          review,
          booker,
          receiver,
          depositAmount: depositAmount || null // Số tiền cọc đã thanh toán
        };
      })
    );

    return res.json({ success: true, data: bookingsWithDetails });
  } catch (err) {
    console.error("[AdminController] getRefundRequests error:", err);
    return res.status(500).json({ success: false, message: "Failed to load refund requests" });
  }
}

async function updateRefundStatus(req, res) {
  try {
    const { bookedScheduleId } = req.params;
    const { refundStatus } = req.body;
    
    if (!refundStatus) {
      return res.status(400).json({ success: false, message: "refundStatus is required" });
    }
    
    if (refundStatus !== 'Finished' && refundStatus !== 'Pending' && refundStatus !== 'Rejected') {
      return res.status(400).json({ success: false, message: "refundStatus must be 'Finished', 'Pending', or 'Rejected'" });
    }
    
    const bookedScheduleModel = require("../models/bookedScheduleModel");
    const updated = await bookedScheduleModel.updateRefundStatus(bookedScheduleId, refundStatus);
    
    if (!updated) {
      return res.status(404).json({ success: false, message: "Booking not found or RefundStatus column does not exist" });
    }
    
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error("[AdminController] updateRefundStatus error:", err);
    return res.status(500).json({ success: false, message: "Failed to update refund status" });
  }
}

module.exports = { 
  getStats, 
  listUsers, 
  getPendingRegistrations, 
  updateUserStatus, 
  updateUserRole, 
  updateBusinessStatus, 
  getUserBusinesses, 
  updateBarStatus,
  getRefundRequests,
  updateRefundStatus
};
