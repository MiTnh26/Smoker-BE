const express = require("express");
const router = express.Router();
const bookingTableController = require("../controllers/bookingTableController");
const { verifyToken } = require("../middleware/authMiddleware");

// Đặt bàn
router.post("/", verifyToken, bookingTableController.create);

// Bar confirm
router.patch("/:id/confirm", verifyToken, bookingTableController.confirm);

// Booker cancel
router.patch("/:id/cancel", verifyToken, bookingTableController.cancel);

// Lấy booking theo người đặt
router.get("/booker/:bookerId", verifyToken, bookingTableController.getByBooker);

// Lấy booking theo bar
router.get("/receiver/:receiverId", verifyToken, bookingTableController.getByReceiver);

module.exports = router;
