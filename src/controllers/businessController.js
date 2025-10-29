// controller/businessController.js
const { createBusinessAccount, updateBusinessAccountFiles, getBusinessAccountsByAccountId, getBusinessAccountById } = require("../models/businessAccountModel");
const { createEntityAccount } = require("../models/entityAccountModel");

// Step 1: HTTP handler - create business account (no files)
exports.registerBusiness = async (req, res) => {
  try {
    const {
      accountId,
      userName,
      role,
      phone = null,
      address = null,
      bio = null,
      gender = null,
      pricePerHours = 0,
      pricePerSession = 0,
    } = req.body || {};
    if (!accountId || !userName || !role)
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const business = await createBusinessAccount({
      accountId,
      userName,
      role,
      phone,
      address,
      bio,
      gender,
      pricePerHours,
      pricePerSession,
      status: "pending",
    });

    // Create EntityAccount record for the business account
    await createEntityAccount("BusinessAccount", business.BussinessAccountId, accountId);

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
    // await updateBusinessAccountFiles(entityId, { avatar, background });
    // return res.status(200).json({ status: "success", data: { avatar, background } });
    const updated = await updateBusinessAccountFiles(entityId, { avatar, background });
    return res.status(200).json({ status: "success", data: updated });
  } catch (err) {
    console.error("uploadBusinessFiles error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};


exports.getBusinessesByAccountId = async (req, res) => {
  try {
    const { accountId } = req.params;
    if (!accountId)
      return res.status(400).json({ status: "error", message: "Thiếu accountId" });

    const businesses = await getBusinessAccountsByAccountId(accountId);
    return res.status(200).json({ status: "success", data: businesses });
  } catch (err) {
    console.error("getBusinessesByAccountId error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};

exports.getBusinessById = async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!businessId)
      return res.status(400).json({ status: "error", message: "Thiếu BussinessAccountId" });

    const business = await getBusinessAccountById(businessId);

    if (!business) {
      return res.status(404).json({ status: "error", message: "Business không tồn tại" });
    }

    return res.status(200).json({ status: "success", data: business });
  } catch (err) {
    console.error("getBusinessById error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};

// Create DJ account
exports.registerDJ = async (req, res) => {
  try {
    const { accountId,
      userName,
      phone = null,
      address = null,
      bio = null,
      gender = null,
      pricePerHours = 0,
      pricePerSession = 0 } = req.body || {};
    if (!accountId || !userName)
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const dj = await createBusinessAccount({
      accountId,
      userName,
      role: "DJ",
      phone,
      address,
      bio,
      gender,
      pricePerHours,
      pricePerSession,
      status: "pending",
    });

    // Create EntityAccount record for the DJ
    await createEntityAccount("BusinessAccount", dj.BussinessAccountId, accountId);

    return res.status(201).json({ status: "success", data: dj });
  } catch (err) {
    console.error("registerDJ error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};

// Create Dancer account
exports.registerDancer = async (req, res) => {
  try {
    const { accountId, userName, phone = null, address = null, bio = null,
      gender = null,
      pricePerHours = 0,
      pricePerSession = 0, } = req.body || {};
    if (!accountId || !userName)
      return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc" });

    const dancer = await createBusinessAccount({
      accountId,
      userName,
      role: "Dancer",
      phone,
      address,
      bio,
      gender,
      pricePerHours,
      pricePerSession,
      status: "pending",
    });

    // Create EntityAccount record for the Dancer
    await createEntityAccount("BusinessAccount", dancer.BussinessAccountId, accountId);

    return res.status(201).json({ status: "success", data: dancer });
  } catch (err) {
    console.error("registerDancer error:", err);
    return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
  }
};