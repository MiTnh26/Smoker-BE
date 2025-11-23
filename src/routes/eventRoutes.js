// src/routes/eventRoutes.js

/**
 * Routes:
 * GET    /api/events/bar/:barPageId?skip=0&take=20
 * GET    /api/events/detail/:id   (hoặc /:id)
 * POST   /api/events           
 * PUT    /api/events/:id        
 * DELETE /api/events/:id
 * PATCH  /api/events/toggle/:id
 */

const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");
const upload = createCloudinaryUpload("events");

router.get("/bar/:barPageId", EventController.getByBar);
router.get("/detail/:id", EventController.getById);
router.post("/", upload.single("Picture"), EventController.create);
router.put("/:id", upload.single("Picture"), EventController.update);
router.delete("/:id", EventController.remove);
router.patch("/toggle/:id", EventController.toggleStatus);

module.exports = router;
