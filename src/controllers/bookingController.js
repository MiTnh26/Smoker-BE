const bookingService = require("../services/bookingService");

class BookingController {
  async createBooking(req, res) {
    try {
      const {
        bookerId,
        receiverId,
        type,
        totalAmount,
        paymentStatus,
        scheduleStatus,
        bookingDate,
        startTime,
        endTime,
        mongoDetailId
      } = req.body;

      if (!bookerId || !receiverId || !type) {
        return res.status(400).json({
          success: false,
          message: "bookerId, receiverId and type are required"
        });
      }

      const bookingData = {
        bookerId,
        receiverId,
        type,
        totalAmount: totalAmount ?? 0,
        paymentStatus: paymentStatus || "Pending",
        scheduleStatus: scheduleStatus || "Pending",
        bookingDate,
        startTime,
        endTime,
        mongoDetailId
      };

      const result = await bookingService.createBooking(bookingData);

      return res.status(201).json({
        success: true,
        data: result,
        message: "Booked schedule created successfully"
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error creating booked schedule",
        error: error.message
      });
    }
  }

  async confirmBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.confirmBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error confirming schedule",
        error: error.message
      });
    }
  }

  async cancelBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.cancelBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error canceling schedule",
        error: error.message
      });
    }
  }

  async rejectBooking(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const result = await bookingService.rejectBookingSchedule(id, userId);

      if (result.success) {
        return res.status(200).json(result);
      }

      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error rejecting schedule",
        error: error.message
      });
    }
  }

  async getByBooker(req, res) {
    try {
      const { bookerId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!bookerId) {
        return res.status(400).json({ success: false, message: "bookerId is required" });
      }

      const result = await bookingService.getBookingsByBooker(bookerId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      if (result.success) {
        return res.status(200).json(result);
      }
      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error fetching schedules by booker",
        error: error.message
      });
    }
  }

  async getByReceiver(req, res) {
    try {
      const { receiverId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!receiverId) {
        return res.status(400).json({ success: false, message: "receiverId is required" });
      }

      const result = await bookingService.getBookingsByReceiver(receiverId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      if (result.success) {
        return res.status(200).json(result);
      }
      return res.status(400).json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Error fetching schedules by receiver",
        error: error.message
      });
    }
  }

  // POST /api/booking/request - Tạo yêu cầu booking (cần xác nhận)
  async createRequest(req, res) {
    try {
      const {
        requesterEntityAccountId,
        requesterRole,
        performerEntityAccountId,
        performerRole,
        date,
        startTime,
        endTime,
        location,
        note,
        offeredPrice
      } = req.body;

      if (!requesterEntityAccountId || !performerEntityAccountId) {
        return res.status(400).json({
          success: false,
          message: "requesterEntityAccountId and performerEntityAccountId are required"
        });
      }

      if (!date || !startTime || !endTime) {
        return res.status(400).json({
          success: false,
          message: "date, startTime and endTime are required"
        });
      }

      // Tạo detailSchedule trong MongoDB cho Location và Note
      const DetailSchedule = require("../models/detailSchedule");
      let mongoDetailId = null;
      
      if (location || note) {
        try {
          const detailDoc = await DetailSchedule.create({
            Location: location || "",
            Note: note || "",
            OfferedPrice: offeredPrice || 0,
            PerformerRole: performerRole,
            RequesterRole: requesterRole || "Customer",
          });
          mongoDetailId = detailDoc._id.toString();
        } catch (error) {
          console.error("[BookingController] Error creating detailSchedule:", error);
          // Continue without detailSchedule if creation fails
        }
      }

      // Tạo booking với status "Pending" (chờ xác nhận)
      const bookingData = {
        bookerId: requesterEntityAccountId,
        receiverId: performerEntityAccountId,
        type: performerRole === "DJ" ? "DJ" : performerRole === "DANCER" ? "DANCER" : "Performer",
        totalAmount: offeredPrice || 0,
        paymentStatus: "Pending",
        scheduleStatus: "Pending", // Chờ xác nhận
        bookingDate: date,
        startTime,
        endTime,
        mongoDetailId
      };

      const result = await bookingService.createBooking(bookingData);

      return res.status(201).json({
        success: true,
        data: result,
        message: "Booking request created successfully. Waiting for confirmation."
      });
    } catch (error) {
      console.error("[BookingController] createRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating booking request",
        error: error.message
      });
    }
  }
}

module.exports = new BookingController();
