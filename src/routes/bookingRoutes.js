const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { verifyToken } = require("../middleware/authMiddleware");

// Tạo lịch đặt mới
router.post("/", verifyToken, bookingController.createBooking);
// Confirm schedule (receiver)
router.patch("/:id/confirm", verifyToken, bookingController.confirmBooking);
// Cancel schedule (booker)
router.patch("/:id/cancel", verifyToken, bookingController.cancelBooking);
// Get schedules by bookerId
router.get("/booker/:bookerId", verifyToken, bookingController.getByBooker);
// Get schedules by receiverId
router.get("/receiver/:receiverId", verifyToken, bookingController.getByReceiver);

module.exports = router;
