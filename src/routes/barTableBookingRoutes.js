const express = require('express');
const router = express.Router();
const barTableBookingController = require('../controllers/barTableBookingController');

// Lấy danh sách bàn theo bar
router.get('/bar/:barId', barTableBookingController.getTablesByBar);
// Lấy thông tin bàn theo ID
router.get('/:tableId', barTableBookingController.getTableById);
// Đặt bàn
router.post('/book', barTableBookingController.bookTable);
// Lấy lịch sử đặt bàn của user
router.get('/bookings/user/:userId', barTableBookingController.getUserBookings);
// Lấy đặt bàn theo bar
router.get('/bookings/bar/:barId', barTableBookingController.getBarBookings);
// Hủy đặt bàn
router.put('/bookings/:bookingId/cancel', barTableBookingController.cancelBooking);
// Cập nhật trạng thái thanh toán
router.put('/bookings/:bookingId/payment', barTableBookingController.updatePaymentStatus);

module.exports = router;