// controller/barPageController.js
const {
    createBarPage,
    updateBarPage,
    getBarPageById,
    getBarPageByAccountId,
    deleteBarPage,
  } = require("../models/barPageModel");
const { createEntityAccount } = require("../models/entityAccountModel");
  
  // Step 1: HTTP handler - create Bar Page
  exports.registerBarPage = async (req, res) => {
    try {
      const { accountId, barName, address = null, phoneNumber = null, email = null } = req.body || {};
  
      if (!accountId || !barName)
        return res.status(400).json({ status: "error", message: "Thiếu dữ liệu bắt buộc (accountId, barName)" });
  
      // Upload files
      const avatar = req.files?.avatar?.[0]?.path || null;
      const background = req.files?.background?.[0]?.path || null;
  
      // Check if account already has a bar page
      const existing = await getBarPageByAccountId(accountId);
      if (existing)
        return res.status(400).json({ status: "error", message: "Tài khoản đã có trang bar" });
  
      const barPage = await createBarPage({
        accountId,
        barName,
        avatar,
        background,
        address,
        phoneNumber,
        email,
        role: "Bar",
      });

      // Create EntityAccount record for the bar
      await createEntityAccount("BarPage", barPage.BarPageId, accountId);

      return res.status(201).json({ status: "success", data: barPage });
    } catch (err) {
      console.error("registerBarPage error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Step 2: HTTP handler - update bar page info or files
  exports.updateBarPageInfo = async (req, res) => {
    try {
      const { barPageId } = req.body || {};
      if (!barPageId)
        return res.status(400).json({ status: "error", message: "Thiếu barPageId" });
  
      const barPage = await getBarPageById(barPageId);
      if (!barPage)
        return res.status(404).json({ status: "error", message: "Không tìm thấy BarPage" });
  
      const avatar = req.files?.avatar?.[0]?.path || barPage.Avatar;
      const background = req.files?.background?.[0]?.path || barPage.Background;
      const { barName, address, phoneNumber, email, addressData } = req.body || {};

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
          console.warn("[BAR] Failed to parse addressData, saving as plain string:", e);
          addressToSave = (address || "").trim();
        }
      }

      const updated = await updateBarPage(barPageId, {
        barName,
        avatar,
        background,
        address: addressToSave,
        phoneNumber,
        email,
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
      console.error("updateBarPageInfo error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Step 3: HTTP handler - get BarPage by accountId
  exports.getBarPageByAccountId = async (req, res) => {
    try {
      const { accountId } = req.params;
      if (!accountId)
        return res.status(400).json({ status: "error", message: "Thiếu accountId" });
  
      const barPage = await getBarPageByAccountId(accountId);
      if (!barPage)
        return res.status(404).json({ status: "error", message: "Không tìm thấy trang bar cho tài khoản này" });

      // Parse address nếu là JSON
      let address = barPage.Address || "";
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
          address = barPage.Address || "";
        }
      }

      return res.status(200).json({ 
        status: "success", 
        data: {
          ...barPage,
          Address: address,
          addressData: addressData
        }
      });
    } catch (err) {
      console.error("getBarPageByAccountId error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Step 4: HTTP handler - get BarPage by barPageId
  exports.getBarPageById = async (req, res) => {
    try {
      const { barPageId } = req.params;
      console.log("📥 [getBarPageById] Received barPageId:", barPageId);
      if (!barPageId){
          console.error("❌ [getBarPageById] Thiếu barPageId trong req.params");
        return res.status(400).json({ status: "error", message: "Thiếu barPageId" });
      }
      
  
      const barPage = await getBarPageById(barPageId);
       console.log("✅ [getBarPageById] Query result:", barPage);
      if (!barPage)
        return res.status(404).json({ status: "error", message: "Không tìm thấy BarPage" });

      // Parse address nếu là JSON
      let address = barPage.Address || "";
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
          address = barPage.Address || "";
        }
      }

      return res.status(200).json({ 
        status: "success", 
        data: {
          ...barPage,
          Address: address,
          addressData: addressData
        }
      });
    } catch (err) {
      console.error("getBarPageById error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  
  // Step 5: HTTP handler - delete BarPage
  exports.deleteBarPage = async (req, res) => {
    try {
      const { barPageId } = req.params;
      if (!barPageId)
        return res.status(400).json({ status: "error", message: "Thiếu barPageId" });
  
      const barPage = await getBarPageById(barPageId);
      if (!barPage)
        return res.status(404).json({ status: "error", message: "Không tìm thấy BarPage" });
  
      await deleteBarPage(barPageId);
      return res.status(200).json({ status: "success", message: "Xóa trang bar thành công" });
    } catch (err) {
      console.error("deleteBarPage error:", err);
      return res.status(500).json({ status: "error", message: err.message || "Lỗi máy chủ" });
    }
  };
  