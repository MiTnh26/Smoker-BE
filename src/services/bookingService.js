const bookedScheduleModel = require("../models/bookedScheduleModel");
const DetailSchedule = require("../models/detailSchedule");
const { getEntityAccountIdByAccountId } = require("../models/entityAccount1Model");

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

  async getBookingsByBooker(bookerId, { limit = 50, offset = 0 } = {}) {
    try {
      const data = await bookedScheduleModel.getBookedSchedulesByBooker(bookerId, { limit, offset });
      
      // Populate detailSchedule từ MongoDB cho mỗi booking
      const bookingsWithDetails = await Promise.all(
        data.map(async (booking) => {
          if (booking.MongoDetailId) {
            try {
              const detailSchedule = await DetailSchedule.findById(booking.MongoDetailId);
              return {
                ...booking,
                detailSchedule: detailSchedule || null,
              };
            } catch (error) {
              console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
              return {
                ...booking,
                detailSchedule: null,
              };
            }
          }
          return {
            ...booking,
            detailSchedule: null,
          };
        })
      );

      return { success: true, data: bookingsWithDetails };
    } catch (error) {
      return { success: false, message: error.message || "Failed to fetch schedules by booker" };
    }
  }

  async getBookingsByReceiver(receiverId, { limit = 50, offset = 0 } = {}) {
    try {
      const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverId, { limit, offset });
      
      // Populate detailSchedule từ MongoDB cho mỗi booking
      const bookingsWithDetails = await Promise.all(
        data.map(async (booking) => {
          if (booking.MongoDetailId) {
            try {
              const detailSchedule = await DetailSchedule.findById(booking.MongoDetailId);
              if (detailSchedule) {
                // Convert Mongoose document to plain object để đảm bảo Location được trả về
                const detailScheduleObj = detailSchedule.toObject ? detailSchedule.toObject() : detailSchedule;
                console.log(`[BookingService] Found detailSchedule for ${booking.MongoDetailId}:`, {
                  Location: detailScheduleObj.Location,
                  Note: detailScheduleObj.Note,
                  hasLocation: !!detailScheduleObj.Location
                });
                return {
                  ...booking,
                  detailSchedule: detailScheduleObj,
                };
              }
              return {
                ...booking,
                detailSchedule: null,
              };
            } catch (error) {
              console.error(`Error fetching detailSchedule for ${booking.MongoDetailId}:`, error);
              return {
                ...booking,
                detailSchedule: null,
              };
            }
          }
          console.log(`[BookingService] No MongoDetailId for booking ${booking.BookedScheduleId}`);
          return {
            ...booking,
            detailSchedule: null,
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
