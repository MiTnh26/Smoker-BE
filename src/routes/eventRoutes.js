// src/routes/eventRoutes.js

/**
 * Routes:
 * tìm kiếm event theo bar
 * GET    /api/events/bar/:barPageId?skip=?&take=?
 * 
 * chi tiết events
 * GET    /api/events/detail/:id  
 *  
 * thêm event
 * POST   /api/events
 * {
  "BarPageId": "513cca31-b62b-4fb4-837b-2a48fea79cb1",
  "EventName": "Tuda Pool Party 2025 - Test JSON",
  "Description": "Tạo bằng JSON, không cần upload file!",
  "StartTime": "2025-12-25T20:00:00",
  "EndTime": "2025-12-26T04:00:00",
  "Picture": "https://res.cloudinary.com/dienwsyhr/image/upload/v1736871234/samples/event-test.jpg"
}   

*sửa event        
 * PUT    /api/events/:id   
{
  "EventName": "Tuda Pool Party 2025 - ĐÃ UPDATE BẰNG JSON",
  "Description": "Cập nhật siêu nhanh, không cần chọn file",
  "StartTime": "2025-12-27T19:00:00",
  "Picture": "https://res.cloudinary.com/dienwsyhr/image/upload/v1736879999/samples/new-banner.jpg"
}    

 * DELETE /api/events/:id

//status invisible và uninvisible
 * PATCH  /api/events/toggle/:id

//có thể tìm kiếm theo tên bar hoặc tên event
 * GET /api/events/search?skip=?&take=?

lấy ra tất cả danh sách event
*GET /api/events/getall?skip=?&take=?
 */

const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { createCloudinaryUpload } = require("../middleware/uploadCloudinary");
const { verifyToken, requireActiveEntity } = require("../middleware/authMiddleware");

const upload = createCloudinaryUpload("events");
router.get("/bar/:barPageId", EventController.getByBar);
router.get("/detail/:id", EventController.getById);
router.put("/:id", upload.single("Picture"), EventController.update);
router.delete("/:id", EventController.remove);
router.patch("/toggle/:id", EventController.toggleStatus);
router.get("/getall", EventController.getAll);
router.get("/search", EventController.search);
router.post("/", verifyToken, requireActiveEntity, upload.single("Picture"), EventController.create);

module.exports = router;
