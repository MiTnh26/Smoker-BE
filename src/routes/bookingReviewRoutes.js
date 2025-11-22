const express = require('express');
const router = express.Router();
const bookingReviewController = require('../controllers/bookingReviewController');

// Lấy tất cả booking schedules với filter
router.get('/schedules', bookingReviewController.getAllBookingSchedules);
// Lấy chi tiết booking schedule
router.get('/schedules/:bookingId', bookingReviewController.getBookingDetail);
// Cập nhật trạng thái booking
router.put('/schedules/:bookingId/status', bookingReviewController.updateBookingStatus);
// Cập nhật trạng thái thanh toán
router.put('/schedules/:bookingId/payment', bookingReviewController.updatePaymentStatus);
// Thống kê booking
router.get('/statistics', bookingReviewController.getBookingStatistics);
// Lấy booking theo bar với filter
router.get('/bar/:barId/schedules', bookingReviewController.getBarBookingsWithFilter);

module.exports = router;