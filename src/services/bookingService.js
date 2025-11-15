const bookedScheduleModel = require("../models/bookedScheduleModel");

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

      if (!this._isSameId(schedule.ReceiverId, userId)) {
        return { success: false, message: "Unauthorized to confirm this schedule" };
      }

      if (schedule.ScheduleStatus === "Canceled") {
        return { success: false, message: "Cannot confirm a canceled schedule" };
      }

      const updatedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
        bookedScheduleId,
        { scheduleStatus: "Confirmed" }
      );

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

  async _autoCompleteIfNeeded(schedule) {
    if (!schedule) return schedule;

    const { EndTime, ScheduleStatus, BookedScheduleId } = schedule;

    if (!EndTime) return schedule;

    const endTimeDate = new Date(EndTime);
    const now = new Date();

    if (endTimeDate <= now && ScheduleStatus !== "Completed" && ScheduleStatus !== "Canceled") {
      const completedSchedule = await bookedScheduleModel.updateBookedScheduleStatuses(
        BookedScheduleId,
        { scheduleStatus: "Completed" }
      );
      return completedSchedule;
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
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message || "Failed to fetch schedules by booker" };
    }
  }

  async getBookingsByReceiver(receiverId, { limit = 50, offset = 0 } = {}) {
    try {
      const data = await bookedScheduleModel.getBookedSchedulesByReceiver(receiverId, { limit, offset });
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message || "Failed to fetch schedules by receiver" };
    }
  }
}

module.exports = new BookingService();
