// Service xử lý các booking (BarTable, DJ, Dancer) chưa thanh toán quá thời gian cho phép

const bookedScheduleModel = require("../models/bookedScheduleModel");

/**
 * Sau maxAgeMinutes:
 * - Nếu booking (BarTable, DJ, Dancer) vẫn PaymentStatus = 'Pending' và ScheduleStatus = 'Pending'
 *   ⇒ tự động đổi ScheduleStatus thành 'Rejected' (không xoá record).
 */
async function cleanupPendingBookings(maxAgeMinutes = 5) {
  try {
    console.log(
      "[BookingTableCleanupService] Starting cleanup for pending bookings (BarTable/DJ/Dancer) older than",
      maxAgeMinutes,
      "minutes"
    );

    const bookings = await bookedScheduleModel.getPendingBookingsOlderThan(maxAgeMinutes);

    if (!bookings.length) {
      console.log("[BookingTableCleanupService] No pending bookings to cleanup");
      return;
    }

    console.log(
      `[BookingTableCleanupService] Found ${bookings.length} pending bookings to update -> Rejected`
    );

    for (const booking of bookings) {
      try {
        console.log("[BookingTableCleanupService] Updating booking to Rejected:", {
          bookedScheduleId: booking.BookedScheduleId,
          paymentStatus: booking.PaymentStatus,
          scheduleStatus: booking.ScheduleStatus,
          created_at: booking.created_at,
        });

        // Cập nhật ScheduleStatus thành 'Rejected', giữ nguyên PaymentStatus = 'Pending'
        const updated = await bookedScheduleModel.updateBookedScheduleStatuses(
          booking.BookedScheduleId,
          { scheduleStatus: "Rejected" }
        );

        console.log("[BookingTableCleanupService] Updated booking:", {
          bookedScheduleId: updated?.BookedScheduleId || booking.BookedScheduleId,
          paymentStatus: updated?.PaymentStatus,
          scheduleStatus: updated?.ScheduleStatus,
        });
      } catch (err) {
        console.error(
          "[BookingTableCleanupService] Error cleaning booking:",
          booking.BookedScheduleId,
          err
        );
      }
    }

    console.log("[BookingTableCleanupService] Cleanup completed");
  } catch (error) {
    console.error("[BookingTableCleanupService] Global error:", error);
  }
}

module.exports = {
  cleanupPendingBookings,
};


