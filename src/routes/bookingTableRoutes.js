const express = require("express");
const router = express.Router();
const bookingTableController = require("../controllers/bookingTableController");
const { verifyToken } = require("../middleware/authMiddleware");

// === COMBO-BASED BOOKING APIs (NEW) ===

// Tạo booking với combo bắt buộc
router.post("/with-combo", verifyToken, bookingTableController.createWithCombo);

// Validate combo và voucher trước khi booking
router.post("/validate-booking-data", verifyToken, bookingTableController.validateBookingData);

// Xác nhận booking bằng QR code
router.post("/confirm-by-qr", verifyToken, bookingTableController.confirmByQR);

// Yêu cầu hoàn tiền
router.post("/:id/request-refund", verifyToken, bookingTableController.requestRefund);

// === COMBO & VOUCHER APIs ===

// Lấy combos available theo bar
router.get("/bar/:barId/available-combos", verifyToken, bookingTableController.getAvailableCombos);

// Lấy vouchers available
router.get("/available-vouchers", verifyToken, bookingTableController.getAvailableVouchers);

// === QR CODE APIs ===

// Lấy QR code của booking (cho người dùng xem)
router.get("/:id/qr-code", verifyToken, bookingTableController.getBookingQRCode);

// Scan QR code để confirm booking (cho bar)
router.post("/scan-qr", verifyToken, bookingTableController.scanQRCode);

// === BAR MANAGEMENT APIs ===

// Lấy bookings đã confirm theo bar
router.get("/bar/:barId/confirmed", verifyToken, bookingTableController.getConfirmedBookingsByBar);

// Lấy bookings chưa confirm theo bar
router.get("/bar/:barId/unconfirmed", verifyToken, bookingTableController.getUnconfirmedBookings);

// === PAYMENT APIs (UPDATED) ===

// Tạo payment link cho toàn bộ combo (mới)
router.post("/:id/create-full-payment", verifyToken, bookingTableController.createFullPayment);
router.get("/:id/get-full-payment-link", verifyToken, bookingTableController.getFullPaymentLink);

// API cũ (backward compatibility)
router.post("/:id/create-payment", verifyToken, bookingTableController.createPayment);
router.get("/:id/get-payment-link", verifyToken, bookingTableController.getPaymentLink);

// === BOOKING MANAGEMENT APIs ===

// Đặt bàn (API cũ - backward compatibility)
router.post("/", verifyToken, bookingTableController.create);

// Xác nhận booking thủ công
router.patch("/:id/confirm", verifyToken, bookingTableController.confirm);

// Đánh dấu khách đã tới quán (thủ công)
router.patch("/:id/mark-arrived", verifyToken, bookingTableController.markArrived);

// Hủy booking
router.patch("/:id/cancel", verifyToken, bookingTableController.cancel);

// Đánh dấu đã thanh toán (fallback)
router.patch("/:id/mark-paid", verifyToken, bookingTableController.markPaid);

// Cập nhật status thành Ended
router.patch("/:id/end", verifyToken, bookingTableController.endBooking);

// === QUERY APIs ===

// Lấy booking theo người đặt
router.get("/booker/:bookerId", verifyToken, bookingTableController.getByBooker);

// Lấy booking theo bar
router.get("/receiver/:receiverId", verifyToken, bookingTableController.getByReceiver);

// Lấy booking theo ID (chi tiết booking cho bar hoặc customer) - ĐẶT SAU CÁC ROUTE KHÁC ĐỂ TRÁNH CONFLICT
router.get("/:id", verifyToken, bookingTableController.getById);

module.exports = router;
