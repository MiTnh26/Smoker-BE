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
// Get schedules by bookerId
router.get("/booker/:bookerId", verifyToken, bookingController.getByBooker);
// Get schedules by receiverId
router.get("/receiver/:receiverId", verifyToken, bookingController.getByReceiver);

module.exports = router;
