const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { cloudinary } = require("../config/cloudinary");

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
        public_id: `${Date.now()}-${file.originalname}`,
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
      } else if (file.fieldname === "audio") {
        resource_type = "auto"; // Cloudinary treats audio as video
        allowed_formats = ["mp3", "wav", "ogg", "m4a", "aac"];
      }
      
      return {
        folder,
        allowed_formats,
        resource_type,
        public_id: `${Date.now()}-${file.originalname}`,
        // Transformations cho video/audio
        transformation: resource_type === "video" ? [
          { quality: "auto", format: "auto" }
        ] : [
          { quality: "auto", format: "auto" }
        ]
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