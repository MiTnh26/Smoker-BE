// controller/businessController.js
const { createBusinessAccount, updateBusinessAccountFiles } = require("../models/businessAccountModel");

// Step 1: HTTP handler - create business account (no files)
exports.registerBusiness = async (req, res) => {
  try {
    const { accountId, userName, role, phone = null, address = null, bio = null } = req.body || {};
    if (!accountId || !userName || !role)
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const business = await createBusinessAccount({
      accountId,
      userName,
      role,
      phone,
      address,
      bio,
      status: "pending",
    });

    return res.status(201).json({ status: "success", data: business });
  } catch (err) {
    console.error("registerBusiness error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};

// Step 2: HTTP handler - upload files for existing business
exports.uploadBusinessFiles = async (req, res) => {
  try {
    const { entityId } = req.body || {};
    if (!entityId) return res.status(400).json({ status: "error", message: "Thiếu entityId" });

    const avatar = req.files?.avatar?.[0]?.path || null;
    const background = req.files?.background?.[0]?.path || null;
    await updateBusinessAccountFiles(entityId, { avatar, background });
    return res.status(200).json({ status: "success", data: { avatar, background } });
  } catch (err) {
    console.error("uploadBusinessFiles error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};
