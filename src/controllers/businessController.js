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
    const { entityId, userName, phone, address, bio, gender, pricePerHours, pricePerSession, addressData } = req.body || {};
    if (!entityId) return res.status(400).json({ status: "error", message: "Thiếu entityId" });

    const avatar = req.files?.avatar?.[0]?.path || null;
    const background = req.files?.background?.[0]?.path || null;
    
    // Xử lý address: nếu có addressData (structured), lưu dưới dạng JSON
    let addressToSave = (address || "").trim();
    if (addressData) {
      try {
        const addressDataObj = typeof addressData === 'string' 
          ? JSON.parse(addressData) 
          : addressData;
        
        addressToSave = JSON.stringify({
          fullAddress: address || addressDataObj.fullAddress || "",
          provinceId: addressDataObj.provinceId || null,
          districtId: addressDataObj.districtId || null,
          wardId: addressDataObj.wardId || null,
          detail: addressDataObj.detail || address || ""
        });
      } catch (e) {
        console.warn("[BUSINESS] Failed to parse addressData, saving as plain string:", e);
        addressToSave = (address || "").trim();
      }
    }
    
    const updated = await updateBusinessAccountFiles(entityId, { 
      avatar, 
      background,
      userName,
      phone,
      address: addressToSave,
      bio,
      gender,
      pricePerHours: pricePerHours ? parseInt(pricePerHours) : null,
      pricePerSession: pricePerSession ? parseInt(pricePerSession) : null
    });
    
    // Parse address để trả về structured data
    let parsedAddress = updated.Address || "";
    let parsedAddressData = null;
    
    if (parsedAddress) {
      try {
        const parsed = JSON.parse(parsedAddress);
        if (parsed && typeof parsed === 'object' && parsed.fullAddress !== undefined) {
          parsedAddressData = {
            provinceId: parsed.provinceId || null,
            districtId: parsed.districtId || null,
            wardId: parsed.wardId || null,
            fullAddress: parsed.fullAddress || ""
          };
          parsedAddress = parsed.fullAddress || parsed.detail || parsedAddress;
        }
      } catch (e) {
        parsedAddress = updated.Address || "";
      }
    }
    
    return res.status(200).json({ 
      status: "success", 
      data: {
        ...updated,
        Address: parsedAddress,
        addressData: parsedAddressData
      }
    });
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

    // Parse address nếu là JSON
    let address = business.Address || "";
    let addressData = null;
    
    if (address) {
      try {
        const parsed = JSON.parse(address);
        if (parsed && typeof parsed === 'object' && parsed.fullAddress !== undefined) {
          addressData = {
            provinceId: parsed.provinceId || null,
            districtId: parsed.districtId || null,
            wardId: parsed.wardId || null,
            fullAddress: parsed.fullAddress || ""
          };
          address = parsed.fullAddress || parsed.detail || address;
        }
      } catch (e) {
        address = business.Address || "";
      }
    }

    return res.status(200).json({ 
      status: "success", 
      data: {
        ...business,
        Address: address,
        addressData: addressData
      }
    });
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