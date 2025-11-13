const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const { verifyToken } = require("../middleware/authMiddleware");

// Create booking request (Bar or Customer -> DJ/Dancer)
router.post("/request", verifyToken, (req, res) => bookingController.createRequest(req, res));

// Get my bookings (as requester/performer) - requires entityAccountId
router.get("/my", verifyToken, (req, res) => bookingController.getMyBookings(req, res));

// Update status
router.post("/:id/:action", verifyToken, (req, res, next) => {
  const { action } = req.params;
  const allowedActions = new Set(["accept", "decline", "cancel"]);

  if (!allowedActions.has(String(action).toLowerCase())) {
    return res.status(400).json({ message: "Invalid action" });
  }

  return bookingController.updateStatus(req, res, next);
});

module.exports = router;


