const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { cloudinary } = require("../config/cloudinary");

// Hàm sanitize tên file để phù hợp với Cloudinary public_id
// Cloudinary chỉ chấp nhận: a-z, A-Z, 0-9, _, -, .
const sanitizeFileName = (filename) => {
  // Lấy phần tên file (bỏ extension)
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  // Lấy extension
  const ext = filename.substring(filename.lastIndexOf('.') + 1);
  
  // Sanitize: chỉ giữ lại chữ cái, số, dấu gạch dưới, dấu gạch ngang, dấu chấm
  // Thay thế các ký tự đặc biệt và khoảng trắng bằng dấu gạch dưới
  const sanitized = nameWithoutExt
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Thay ký tự không hợp lệ bằng _
    .replace(/_{2,}/g, '_') // Loại bỏ nhiều _ liên tiếp
    .replace(/^_+|_+$/g, ''); // Loại bỏ _ ở đầu và cuối
  
  // Nếu tên file rỗng sau khi sanitize, dùng tên mặc định
  const finalName = sanitized || 'file';
  
  // Trả về tên file đã sanitize + extension
  return ext ? `${finalName}.${ext}` : finalName;
};

const createCloudinaryUpload = (entity = "users") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const id = req.entityId || "unknown"; // entityId sẽ được gán trước khi upload
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

// Middleware riêng cho posts - hỗ trợ video/audio
const createPostUpload = () => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const userId = req.user?.id || "unknown";
      const folder = `Smoker/posts/${userId}/${file.fieldname}`;
      
      // Xác định resource_type dựa trên fieldname
      let resource_type = "image";
      let allowed_formats = ["jpg", "jpeg", "png", "webp", "avif"];
      
      if (file.fieldname === "videos") {
        resource_type = "video";
        allowed_formats = ["mp4", "mov", "avi", "webm", "mkv"];
      } else if (file.fieldname === "audios" || file.fieldname === "audio") {
        resource_type = "auto"; // Cloudinary treats audio as video
        allowed_formats = ["mp3", "wav", "ogg", "m4a", "aac"];
      }
      
      // Transformations cho video/audio
      let transformation = [];
      if (resource_type === "video" || resource_type === "auto") {
        transformation = [
          { quality: "auto", format: "auto" }
        ];
        // Nếu là audio cho story, cắt nhạc theo thông tin từ frontend
        if ((file.fieldname === "audios" || file.fieldname === "audio") && req.body?.type === "story") {
          const startOffset = parseFloat(req.body?.audioStartOffset) || 0;
          const duration = parseFloat(req.body?.audioDuration) || 15;
          // Luôn cắt nhạc cho story (mặc định 15 giây đầu nếu không có thông tin)
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
      fileSize: 100 * 1024 * 1024, // 100MB limit
    }
  });
};

module.exports = { createCloudinaryUpload, createPostUpload };