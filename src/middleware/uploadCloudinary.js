const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { cloudinary } = require("../config/cloudinary");

// Hàm sanitize tên file để phù hợp với Cloudinary public_id
const sanitizeFileName = (filename) => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const ext = filename.substring(filename.lastIndexOf('.') + 1);
  
  const sanitized = nameWithoutExt
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  
  const finalName = sanitized || 'file';
  return ext ? `${finalName}.${ext}` : finalName;
};

// Middleware chung (giữ nguyên)
const createCloudinaryUpload = (entity = "users") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const id = req.entityId || "unknown";
      const folder = `Smoker/${entity}/${id}/${file.fieldname}`;
      return {
        folder,
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
        transformation:
          file.fieldname === "avatar" ? [{ width: 300, height: 300, crop: "limit" }] : [],
        public_id: `${Date.now()}-${sanitizeFileName(file.originalname)}`,
        resource_type: "image",
      };
    },
  });

  return multer({ storage });
};

// Middleware riêng cho posts (giữ nguyên)
const createPostUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const userId = req.user?.id || "unknown";
      const folder = `Smoker/posts/${userId}/${file.fieldname}`;
      
      let resource_type = "image";
      let allowed_formats = ["jpg", "jpeg", "png", "webp", "avif"];
      
      if (file.fieldname === "videos") {
        resource_type = "video";
        allowed_formats = ["mp4", "mov", "avi", "webm", "mkv"];
      } else if (file.fieldname === "audios" || file.fieldname === "audio") {
        resource_type = "auto";
        allowed_formats = ["mp3", "wav", "ogg", "m4a", "aac"];
      }
      
      let transformation = [];
      if (resource_type === "video" || resource_type === "auto") {
        transformation = [
          { quality: "auto", format: "auto" }
        ];
        if ((file.fieldname === "audios" || file.fieldname === "audio") && req.body?.type === "story") {
          const startOffset = parseFloat(req.body?.audioStartOffset) || 0;
          const duration = parseFloat(req.body?.audioDuration) || 15;
          transformation.push(
            { start_offset: startOffset },
            { duration: duration }
          );
        }
      } else {
        transformation = [
          { quality: "auto", format: "auto" }
        ];
      }
      
      return {
        folder,
        allowed_formats,
        resource_type,
        public_id: `${Date.now()}-${sanitizeFileName(file.originalname)}`,
        transformation: transformation
      };
    },
  });

  return multer({ 
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024,
    }
  });
};

// MIDDLEWARE RIÊNG CHO EVENTS
const createEventUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      // Lấy barPageId từ request body, params, hoặc từ event hiện có (khi update)
      let barPageId = req.body.BarPageId || req.params.barPageId;
      
      // Nếu không có barPageId (khi update), lấy từ eventId trong params
      if (!barPageId && req.params.id) {
        try {
          const EventModel = require("../models/eventModel");
          const event = await EventModel.getEventById(req.params.id);
          if (event && event.BarPageId) {
            barPageId = event.BarPageId;
            console.log("📋 Got BarPageId from existing event:", barPageId);
          }
        } catch (err) {
          console.warn("⚠️ Could not get BarPageId from event:", err.message);
        }
      }
      
      barPageId = barPageId || "unknown";
      const folder = `Smoker/events/${barPageId}/Picture`;
      
      console.log("=== EVENT UPLOAD DEBUG ===");
      console.log("Method:", req.method);
      console.log("BarPageId:", barPageId);
      console.log("EventId (if update):", req.params.id);
      console.log("File:", {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      
      // Transformation cho ảnh event - tối ưu cho hiển thị
      const transformation = [
        { width: 1200, height: 800, crop: "limit" }, // Kích thước tối ưu
        { quality: "auto", format: "auto" }, // Tự động chọn chất lượng và format tốt nhất
        { fetch_format: "auto" } // Tự động chọn format (webp, avif nếu supported)
      ];
      
      return {
        folder,
        allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
        resource_type: "image",
        public_id: `${Date.now()}-${sanitizeFileName(file.originalname)}`,
        transformation: transformation,
        // Các options quan trọng cho events
        eager: [
          { width: 600, height: 400, crop: "limit" } // Tạo version nhỏ hơn cho thumbnail
        ],
        eager_async: true,
        tags: ["event", "smoker"] // Thêm tags để dễ quản lý
      };
    },
  });

  return multer({ 
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB cho ảnh event
    },
    fileFilter: (req, file, cb) => {
      // Chỉ chấp nhận file ảnh
      if (file.mimetype.startsWith('image/')) {
        console.log("File accepted:", file.originalname);
        cb(null, true);
      } else {
        console.log("File rejected - not an image:", file.originalname);
        cb(new Error('Chỉ chấp nhận file ảnh cho sự kiện!'), false);
      }
    }
  });
};

module.exports = { 
  createCloudinaryUpload, 
  createPostUpload, 
  createEventUpload // THÊM DÒNG NÀY
};