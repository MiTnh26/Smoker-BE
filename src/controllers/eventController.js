// src/controllers/eventController.js
const EventService = require("../services/eventService");
const { error } = require("../utils/response");

// Simple UUID (RFC 4122) validator - không dùng uuid package vì nó là ES Module
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuidValidate(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// GET /api/events/bar/:barPageId
async function getByBar(req, res) {
  try {
    const { barPageId } = req.params;
    const result = await EventService.listByBar(barPageId, req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getByBar error:", e);
    res.status(500).json(error("Lỗi máy chủ khi lấy danh sách sự kiện"));
  }
}

// PATCH /api/events/toggle/:id
// eventController.js
async function toggleStatus(req, res) {
  try {
    const eventId = req.params.id;

    // Thêm validate ở đây nữa cho chắc chắn
    if (!eventId || !uuidValidate(eventId)) {
      return res.status(400).json(error("ID không hợp lệ"));
    }

    const result = await EventService.toggleStatus(eventId);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("toggleStatus error:", e);
    res.status(500).json(error("Lỗi server"));
  }
}

// GET /api/events/detail/:id  (hoặc /:id tùy bạn cấu hình trong routes)
async function getById(req, res) {
  try {
    const result = await EventService.getById(req.params.id);
    res.status(result.statusCode || (result.ok ? 200 : 200)).json(result);
  } catch (e) {
    console.error("getById error:", e);
    res.status(500).json(error("Lỗi máy chủ khi lấy sự kiện"));
  }
}

// POST /api/events
// src/controllers/eventController.js

// src/controllers/eventController.js → create

async function create(req, res) {
  try {
    console.log("=== EVENT CREATE DEBUG ===");
    console.log("req.file:", req.file);
    console.log("req.body:", req.body);

    // Lấy URL ảnh từ req.file - CloudinaryStorage có thể trả về secure_url, url, hoặc path
    let pictureUrl = "";
    if (req.file) {
      // Thử các field có thể có
      pictureUrl = req.file.secure_url || 
                   req.file.url || 
                   req.file.path || 
                   "";
      
      console.log("Picture URL extracted:", pictureUrl);
      
      if (!pictureUrl) {
        console.warn("⚠️ req.file exists but no URL found. File object:", {
          keys: Object.keys(req.file),
          secure_url: req.file.secure_url,
          url: req.file.url,
          path: req.file.path
        });
      }
    } else {
      console.log("⚠️ No file uploaded (req.file is null/undefined)");
    }

    const payload = {
      BarPageId: req.body.BarPageId,
      EventName: (req.body.EventName || "").trim(),
      Description: (req.body.Description || "").trim(),
      StartTime: req.body.StartTime,
      EndTime: req.body.EndTime,
      Picture: pictureUrl, // URL từ Cloudinary
    };

    console.log("Final payload gửi vào service:", payload);

    const result = await EventService.create(payload);
    res.status(201).json(result);
  } catch (e) {
    console.error("CREATE ERROR:", e);
    res.status(500).json(error("Lỗi server: " + e.message));
  }
}
// PUT /api/events/:id
async function update(req, res) {
  try {
    const eventId = req.params.id;

    console.log("=== EVENT UPDATE DEBUG ===");
    console.log("Event ID:", eventId);
    console.log("req.file:", req.file ? "EXISTS" : "NULL");
    console.log("req.body keys:", Object.keys(req.body));

    // Validate eventId
    if (!eventId || !uuidValidate(eventId)) {
      console.log("❌ Invalid event ID:", eventId);
      return res.status(400).json(error("ID sự kiện không hợp lệ"));
    }

    const payload = {
      EventName: req.body.EventName?.trim(),
      Description: (req.body.Description || "").trim(),
      StartTime: req.body.StartTime,
      EndTime: req.body.EndTime,
    };

    // Validate và parse datetime
    if (payload.StartTime) {
      const startDate = new Date(payload.StartTime);
      if (Number.isNaN(startDate.getTime())) {
        console.log("❌ Invalid StartTime:", payload.StartTime);
        return res.status(400).json(error("Thời gian bắt đầu không hợp lệ"));
      }
      payload.StartTime = startDate.toISOString();
    }

    if (payload.EndTime) {
      const endDate = new Date(payload.EndTime);
      if (Number.isNaN(endDate.getTime())) {
        console.log("❌ Invalid EndTime:", payload.EndTime);
        return res.status(400).json(error("Thời gian kết thúc không hợp lệ"));
      }
      payload.EndTime = endDate.toISOString();
    }

    // Xử lý ảnh - GIỐNG HỆT CREATE: luôn lấy từ req.file nếu có
    let pictureUrl = "";
    if (req.file) {
      // Lấy URL từ nhiều field có thể có (giống create)
      pictureUrl = req.file.secure_url || 
                   req.file.url || 
                   req.file.path || 
                   "";
      
      console.log("📸 File uploaded - Extracted URL:", pictureUrl);
      console.log("📸 req.file keys:", Object.keys(req.file));
      
      if (pictureUrl) {
        payload.Picture = pictureUrl; // QUAN TRỌNG: Luôn set vào payload
        console.log("✅ Using new picture URL:", pictureUrl);
      } else {
        console.warn("⚠️ req.file exists but no URL found. File object:", {
          keys: Object.keys(req.file),
          secure_url: req.file.secure_url,
          url: req.file.url,
          path: req.file.path
        });
        // Nếu không có URL, vẫn set empty string để tránh lỗi
        payload.Picture = "";
      }
    } 
    // Nếu frontend gửi Picture = "" → nghĩa là muốn xóa ảnh
    else if (req.body.Picture === "" || req.body.Picture === null) {
      payload.Picture = "";
      console.log("🗑️ Removing picture (Picture = '')");
    }
    // Ngược lại → không set payload.Picture → service sẽ không update ảnh (giữ nguyên ảnh cũ)
    else {
      console.log("ℹ️ No file uploaded and no Picture field in body - keeping existing picture");
      // KHÔNG set payload.Picture → service sẽ không update field này
    }

    console.log("Final payload for update:", payload);
    console.log("Payload.Picture:", payload.Picture ? "✅ Has URL" : "❌ No URL");

    const result = await EventService.update(eventId, payload);
    
    // Log kết quả
    if (result && result.data) {
      console.log("✅ Update result - Picture:", result.data.Picture || "Not updated");
    }

    // Kiểm tra result.status thay vì result.ok
    if (result.status === "error") {
      return res.status(result.code || 400).json(result);
    }
    
    // Nếu thành công, trả về status 200
    res.status(200).json(result);
  } catch (e) {
    console.error("UPDATE ERROR:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json(error("Lỗi server: " + e.message));
  }
}

// DELETE /api/events/:id
async function remove(req, res) {
  try {
    const result = await EventService.remove(req.params.id);
    res.status(result.statusCode || (result.ok ? 200 : 404)).json(result);
  } catch (e) {
    console.error("delete event error:", e);
    res.status(500).json(error("Lỗi máy chủ khi xoá sự kiện"));
  }
}
// GET /api/events
async function getAll(req, res) {
  try {
    const result = await EventService.getAll(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getAll events error:", e);
    res.status(500).json(error("Lỗi máy chủ"));
  }
}

// GET /api/events/search?q=summer
async function search(req, res) {
  try {
    const result = await EventService.search(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("search events error:", e);
    res.status(500).json(error("Lỗi máy chủ khi tìm kiếm"));
  }
}

// GET /api/events/bars-with-events?hours=168&skip=0&take=20
async function getBarsWithNewEvents(req, res) {
  try {
    const result = await EventService.getBarsWithNewEvents(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getBarsWithNewEvents error:", e);
    res.status(500).json(error("Lỗi máy chủ"));
  }
}

// GET /api/events/feed?hours=168&skip=0&take=20
async function getEventsWithBarRating(req, res) {
  try {
    const result = await EventService.getEventsWithBarRating(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getEventsWithBarRating error:", e);
    res.status(500).json(error("Lỗi máy chủ"));
  }
}

// GET /api/events/ongoing-upcoming?hours=168&skip=0&take=20
// Lấy events đang và sắp diễn ra, sắp xếp theo average rating của bar (giảm dần)
async function getOngoingAndUpcomingEvents(req, res) {
  try {
    const result = await EventService.getOngoingAndUpcomingEvents(req.query);
    res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error("getOngoingAndUpcomingEvents error:", e);
    res.status(500).json(error("Lỗi máy chủ"));
  }
}

module.exports = {
  getByBar,
  toggleStatus,
  getById,
  create,
  update,
  remove,
  getAll,     // mới
  search,
  getBarsWithNewEvents,
  getEventsWithBarRating,
  getOngoingAndUpcomingEvents,
};
