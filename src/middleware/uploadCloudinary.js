const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const { cloudinary } = require("../config/cloudinary");

const createCloudinaryUpload = (entity = "users") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const id = req.body.entityId || "unknown"; // entityId sẽ được gán trước khi upload
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

module.exports = createCloudinaryUpload;
