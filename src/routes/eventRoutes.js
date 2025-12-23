// src/routes/eventRoutes.js
const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { createEventUpload } = require("../middleware/uploadCloudinary"); // IMPORT MIDDLEWARE MỚI
const { verifyToken, requireActiveEntity } = require("../middleware/authMiddleware");

// Sử dụng middleware riêng cho events
const eventUpload = createEventUpload();

// Routes với middleware upload riêng cho events
router.get("/bar/:barPageId", EventController.getByBar);
router.get("/detail/:id", EventController.getById);
router.post("/", eventUpload.single("Picture"), EventController.create); // SỬ DỤNG MIDDLEWARE MỚI
// Update event - với middleware upload và error handling
router.put("/:id", (req, res, next) => {
  console.log("🔄 PUT /events/:id - Multer middleware");
  console.log("  Content-Type:", req.headers["content-type"]);
  console.log("  EventId:", req.params.id);
  
  eventUpload.single("Picture")(req, res, (err) => {
    if (err) {
      console.error("❌ Multer error:", err.message);
      return res.status(400).json({ 
        success: false, 
        message: err.message || "Lỗi upload file" 
      });
    }
    
    console.log("✅ Multer completed - req.file:", req.file ? "EXISTS" : "NULL");
    if (req.file) {
      console.log("  File info:", {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        keys: Object.keys(req.file),
        secure_url: req.file.secure_url,
        url: req.file.url,
        path: req.file.path
      });
    }
    
    next();
  });
}, EventController.update);
router.delete("/:id", EventController.remove);
router.patch("/toggle/:id", EventController.toggleStatus);
router.get("/getall", EventController.getAll);
router.get("/search", EventController.search);
router.get("/bars-with-events", EventController.getBarsWithNewEvents);
router.get("/feed", EventController.getEventsWithBarRating);
router.get("/ongoing-upcoming", EventController.getOngoingAndUpcomingEvents);

module.exports = router;