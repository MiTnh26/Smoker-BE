const bookedScheduleModel = require("../models/bookedScheduleModel");
const DetailSchedule = require("../models/detailSchedule");
const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");
const { getPool, sql } = require("../db/sqlserver");

class BookingService {
  async createBooking(bookingData) {
    try {
      const createdBooking = await bookedScheduleModel.createBookedSchedule(bookingData);
      return createdBooking;
    } catch (error) {
      throw new Error(error.message || "Failed to create booked schedule");
    }
  }

  async confirmBookingSchedule(bookedScheduleId, userId) {
    try {
      const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);

      if (!schedule) {
        return { success: false, message: "Booked schedule not found" };
      }

      // userId từ token là AccountId, cần convert sang EntityAccountId để so sánh với ReceiverId
      // ReceiverId là EntityAccountId của receiver (DJ/Dancer BusinessAccount hoặc BarPage)
      // Cần tìm tất cả EntityAccountId của AccountId và so sánh với ReceiverId
      let isAuthorized = false;
      
      // Thử tìm EntityAccountId với các EntityType phổ biến và so sánh với ReceiverId
      const entityTypes = ["BusinessAccount", "BarPage", "Account"];
      for (const entityType of entityTypes) {
        const entityAccountId = await getEntityAccountIdByAccountId(userId, entityType);
        if (entityAccountId && this._isSameId(schedule.ReceiverId, entityAccountId)) {
          isAuthorized = true;
          break;
        }
      }

      if (!isAuthorized) {
        return { success: false, message: "Unauthorized to confirm this schedule" };
      }

      if (schedule.ScheduleStatus === "Canceled") {
        return { success: false, message: "Cannot confirm a canceled schedule" };
      }

      // Confirm the booking
      const updatedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
        bookedScheduleId,
        { scheduleStatus: "Confirmed" }
      );

      // Auto-reject other pending bookings on the same date for the same receiver
      if (schedule.BookingDate) {
        try {
          const bookingDate = new Date(schedule.BookingDate);
          // Format date as YYYY-MM-DD for the query
          const dateString = bookingDate.toISOString().split('T')[0];

          // Get all bookings on the same date for the same receiver
          const sameDateBookings = await bookedScheduleModel.getBookedSchedulesByReceiver(
            schedule.ReceiverId,
            { limit: 1000, date: dateString }
          );

          // Filter pending bookings (excluding the one we just confirmed)
          const pendingBookings = sameDateBookings.filter(b => {
            const bookingId = b.BookedScheduleId || b.bookedScheduleId;
            const status = b.ScheduleStatus || b.scheduleStatus;
            return bookingId && 
                   bookingId.toLowerCase() !== bookedScheduleId.toLowerCase() &&
                   status === "Pending";
          });

          // Reject all other pending bookings on the same date
          for (const pendingBooking of pendingBookings) {
            const bookingId = pendingBooking.BookedScheduleId || pendingBooking.bookedScheduleId;
            if (bookingId) {
              await bookedScheduleModel.updateBookedScheduleStatuses(
                bookingId,
                { scheduleStatus: "Canceled" }
              );
            }
          }

          if (pendingBookings.length > 0) {
            console.log(`[BookingService] Auto-rejected ${pendingBookings.length} pending bookings on the same date`);
          }
        } catch (error) {
          console.error("[BookingService] Error auto-rejecting same-date bookings:", error);
          // Don't fail the confirmation if auto-reject fails
        }
      }

      const finalSchedule = await this._autoCompleteIfNeeded(updatedSchedule);

      return {
        success: true,
        data: finalSchedule,
        message: "Schedule confirmed successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Failed to confirm schedule"
      };
    }
  }

  async cancelBookingSchedule(bookedScheduleId, userId) {
    try {
      const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);

      if (!schedule) {
        return { success: false, message: "Booked schedule not found" };
      }

      if (!this._isSameId(schedule.BookerId, userId)) {
        return { success: false, message: "Unauthorized to cancel this schedule" };
      }

      if (schedule.ScheduleStatus !== "Pending") {
        return { success: false, message: "Only pending schedules can be canceled" };
      }

      const updatedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
        bookedScheduleId,
        { scheduleStatus: "Canceled" }
      );

      return {
        success: true,
        data: updatedSchedule,
        message: "Schedule canceled successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Failed to cancel schedule"
      };
    }
  }

  async rejectBookingSchedule(bookedScheduleId, userId) {
    try {
      const schedule = await bookedScheduleModel.getBookedScheduleById(bookedScheduleId);

      if (!schedule) {
        return { success: false, message: "Booked schedule not found" };
      }

      // Check if user is the receiver (DJ/Dancer) - similar to confirmBookingSchedule
      let isAuthorized = false;
      const entityTypes = ["BusinessAccount", "BarPage", "Account"];
      for (const entityType of entityTypes) {
        const entityAccountId = await getEntityAccountIdByAccountId(userId, entityType);
        if (entityAccountId && this._isSameId(schedule.ReceiverId, entityAccountId)) {
          isAuthorized = true;
          break;
        }
      }

      if (!isAuthorized) {
        return { success: false, message: "Unauthorized to reject this schedule" };
      }

      if (schedule.ScheduleStatus !== "Pending") {
        return { success: false, message: "Only pending schedules can be rejected" };
      }

      const updatedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
        bookedScheduleId,
        { scheduleStatus: "Rejected" }
      );

      return {
        success: true,
        data: updatedSchedule,
        message: "Schedule rejected successfully"
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || "Failed to reject schedule"
      };
    }
  }

  async _autoCompleteIfNeeded(schedule) {
    if (!schedule) return schedule;

    const { EndTime, ScheduleStatus, BookedScheduleId, PaymentStatus } = schedule;

    if (!EndTime) return schedule;

    const endTimeDate = new Date(EndTime);
    const now = new Date();

    // Tự động complete sau 7 ngày kể từ khi booking kết thúc (nếu không có khiếu nại)
    // Chỉ áp dụng cho booking đã được confirm và đã thanh toán cọc
    if (endTimeDate <= now && 
        ScheduleStatus === "Confirmed" && 
        PaymentStatus === "Paid" &&
        ScheduleStatus !== "Completed" && 
        ScheduleStatus !== "Canceled") {
      
      // Tính số ngày đã trôi qua kể từ khi booking kết thúc
      const daysSinceEnd = Math.floor((now - endTimeDate) / (1000 * 60 * 60 * 24));
      
      // Nếu đã qua 7 ngày, tự động complete
      if (daysSinceEnd >= 7) {
        const completedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
          BookedScheduleId,
          { 
            scheduleStatus: "Completed",
            paymentStatus: "Paid" // Tự động chuyển payment status thành Paid
          }
        );
        return completedSchedule;
      }
    }

    return schedule;
  }

  _isSameId(id1, id2) {
    if (!id1 || !id2) return false;
    return id1.toString().toLowerCase() === id2.toString().toLowerCase();
  }

  /**
   * Helper function để lấy thông tin receiver (Bar, DJ, Dancer) từ EntityAccountId
   * @param {string} receiverId - EntityAccountId của receiver
   * @returns {Promise<object|null>} Thông tin receiver hoặc null nếu không tìm thấy
   */
  async _getReceiverInfo(receiverId) {
    try {
      if (!receiverId) return null;
      
      const pool = await getPool();
      const request = pool.request();
      request.input('EntityAccountId', sql.UniqueIdentifier, receiverId);
      
      const result = await request.query(`
        SELECT 
          EA.EntityAccountId, EA.EntityType, EA.EntityId,
          -- Name/UserName
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.UserName
            WHEN EA.EntityType = 'BarPage' THEN BP.BarName
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.UserName
            ELSE NULL
          END AS name,
          -- Avatar
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Avatar
            WHEN EA.EntityType = 'BarPage' THEN BP.Avatar
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Avatar
            ELSE NULL
          END AS avatar,
          -- Background
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Background
            WHEN EA.EntityType = 'BarPage' THEN BP.Background
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Background
            ELSE NULL
          END AS background,
          -- Bio/Description
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Bio
            WHEN EA.EntityType = 'BarPage' THEN NULL
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Bio
            ELSE NULL
          END AS bio,
          -- Role
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Role
            WHEN EA.EntityType = 'BarPage' THEN 'BAR'
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Role
            ELSE NULL
          END AS role,
          -- Address
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Address
            WHEN EA.EntityType = 'BarPage' THEN BP.Address
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Address
            ELSE NULL
          END AS address,
          -- Phone
          CASE 
            WHEN EA.EntityType = 'Account' THEN A.Phone
            WHEN EA.EntityType = 'BarPage' THEN BP.PhoneNumber
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Phone
            ELSE NULL
          END AS phone,
          -- Gender (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.Gender
            ELSE NULL
          END AS gender,
          -- PricePerHours (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.PricePerHours
            ELSE NULL
          END AS pricePerHours,
          -- PricePerSession (BusinessAccount only)
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.PricePerSession
            ELSE NULL
          END AS pricePerSession,
          -- BarPageId for bar profiles
          CASE 
            WHEN EA.EntityType = 'BarPage' THEN BP.BarPageId
            ELSE NULL
          END AS barPageId,
          -- BusinessAccountId for business profiles
          CASE 
            WHEN EA.EntityType = 'BusinessAccount' THEN BA.BussinessAccountId
            ELSE NULL
          END AS businessAccountId
        FROM EntityAccounts EA
        LEFT JOIN Accounts A ON EA.EntityType = 'Account' AND EA.EntityId = A.AccountId
        LEFT JOIN BarPages BP ON EA.EntityType = 'BarPage' AND EA.EntityId = BP.BarPageId
        LEFT JOIN BussinessAccounts BA ON EA.EntityType = 'BusinessAccount' AND EA.EntityId = BA.BussinessAccountId
        WHERE EA.EntityAccountId = @EntityAccountId
      `);
      
      if (!result || !result.recordset || result.recordset.length === 0) {
        return null;
      }
      
      const entityInfo = result.recordset[0];
      return {
        entityAccountId: entityInfo.EntityAccountId,
        entityType: entityInfo.EntityType,
        entityId: entityInfo.EntityId,
        name: entityInfo.name,
        userName: entityInfo.name, // Alias for compatibility
        avatar: entityInfo.avatar,
        background: entityInfo.background,
        bio: entityInfo.bio,
        role: entityInfo.role,
        address: entityInfo.address,
        phone: entityInfo.phone,
        gender: entityInfo.gender,
        pricePerHours: entityInfo.pricePerHours,
        pricePerSession: entityInfo.pricePerSession,
        barPageId: entityInfo.barPageId,
        businessAccountId: entityInfo.businessAccountId
      };
    } catch (error) {
      console.error(`[BookingService] Error fetching receiver info for ${receiverId}:`, error);
      return null;
    }
  }

  async getBookingsByBooker(bookerId, { limit = 50, offset = 0 } = {}) {
    try {
      console.log(`[BookingService] getBookingsByBooker called with bookerId: ${bookerId}, limit: ${limit}, offset: ${offset}`);
      const data = await bookedScheduleModel.getBookedSchedulesByBooker(bookerId, { limit, offset });
      console.log(`[BookingService] Found ${data.length} bookings from database`);
      
      // Log payment status của các booking
      data.forEach((booking, index) => {
        console.log(`[BookingService] Booking ${index + 1}:`, {
          BookedScheduleId: booking.BookedScheduleId,
          PaymentStatus: booking.PaymentStatus,
          ScheduleStatus: booking.ScheduleStatus,
          Type: booking.Type,
          MongoDetailId: booking.MongoDetailId
        });
      });
      
      // Populate detailSchedule và receiver info từ MongoDB và SQL Server cho mỗi booking
      const bookingsWithDetails = await Promise.all(
        data.map(async (booking) => {
          let detailSchedule = null;
          let receiverInfo = null;
          
          // Populate detailSchedule từ MongoDB
          if (booking.MongoDetailId) {
            try {
              const detailScheduleDoc = await DetailSchedule.findById(booking.MongoDetailId);
              if (detailScheduleDoc) {
                // Convert Mongoose document to plain object với flattenMaps để convert Map thành Object
                detailSchedule = detailScheduleDoc.toObject ? detailScheduleDoc.toObject({ flattenMaps: true }) : detailScheduleDoc;
              }
            } catch (error) {
              console.error(`[BookingService] Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
            }
          }
          
          // Populate receiver info từ SQL Server
          if (booking.ReceiverId) {
            try {
              receiverInfo = await this._getReceiverInfo(booking.ReceiverId);
            } catch (error) {
              console.error(`[BookingService] Error fetching receiver info for ${booking.ReceiverId}:`, error);
            }
          }
          
          return {
            ...booking,
            detailSchedule: detailSchedule,
            receiverInfo: receiverInfo
          };
        })
      );

      console.log(`[BookingService] Returning ${bookingsWithDetails.length} bookings with details`);
      return { success: true, data: bookingsWithDetails };
    } catch (error) {
      console.error(`[BookingService] Error in getBookingsByBooker:`, error);
      return { success: false, message: error.message || "Failed to fetch schedules by booker" };
    }
  }

  async getBookingsByReceiver(receiverId, { limit = 50, offset = 0 } = {}) {
    try {
      const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverId, { limit, offset });
      
      // Populate detailSchedule từ MongoDB cho mỗi booking
      const bookingsWithDetails = await Promise.all(
        data.map(async (booking) => {
          let detailSchedule = null;
          
          if (booking.MongoDetailId) {
            try {
              const detailScheduleDoc = await DetailSchedule.findById(booking.MongoDetailId);
              if (detailScheduleDoc) {
                // Convert Mongoose document to plain object với flattenMaps để convert Map thành Object
                detailSchedule = detailScheduleDoc.toObject ? detailScheduleDoc.toObject({ flattenMaps: true }) : detailScheduleDoc;
                console.log(`[BookingService] Found detailSchedule for ${booking.MongoDetailId}:`, {
                  Location: detailSchedule.Location,
                  Phone: detailSchedule.Phone,
                  Note: detailSchedule.Note,
                  hasLocation: !!detailSchedule.Location,
                  hasPhone: !!detailSchedule.Phone
                });
              }
            } catch (error) {
              console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
            }
          } else {
            console.log(`[BookingService] No MongoDetailId for booking ${booking.BookedScheduleId}`);
          }
          
          return {
            ...booking,
            detailSchedule: detailSchedule,
          };
        })
      );

      return { success: true, data: bookingsWithDetails };
    } catch (error) {
      return { success: false, message: error.message || "Failed to fetch schedules by receiver" };
    }
  }
}

module.exports = new BookingService();
