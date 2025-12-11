const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tạo lịch đặt mới
router.post("/", verifyToken, bookingController.createBooking);
// Tạo yêu cầu booking (cần xác nhận)
router.post("/request", verifyToken, bookingController.createRequest);
// Confirm schedule (receiver)
router.patch("/:id/confirm", verifyToken, bookingController.confirmBooking);
// Cancel schedule (booker)
router.patch("/:id/cancel", verifyToken, bookingController.cancelBooking);
// Reject schedule (receiver - DJ/Dancer)
router.patch("/:id/reject", verifyToken, bookingController.rejectBooking);
// Get my bookings (current user's bookings as booker)
router.get("/my", verifyToken, bookingController.getMyBookings);
// Get schedules by bookerId
router.get("/booker/:bookerId", verifyToken, bookingController.getByBooker);
// Get schedules by receiverId
router.get("/receiver/:receiverId", verifyToken, bookingController.getByReceiver);
// Create payment link for booking
router.post("/:id/create-payment", verifyToken, bookingController.createPayment);
// Check and update payment status from PayOS (nếu webhook không được gọi)
router.post("/:id/check-payment", verifyToken, bookingController.checkAndUpdatePaymentStatus);
// Complete transaction (DJ/Dancer xác nhận đã giao dịch xong)
router.post("/:id/complete-transaction", verifyToken, bookingController.completeTransaction);
// Auto-complete bookings (có thể gọi định kỳ hoặc từ cron job)
router.get("/auto-complete", bookingController.autoCompleteBookings);

module.exports = router;
