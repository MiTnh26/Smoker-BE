


const { accountModel,entityAccountModel } = require("../models");
const { getPool, sql } = require("../db/sqlserver");
const { success, error } = require("../utils/response");

async function me(req, res) {
  try {
    const userId = req.user.id;
    const user = await accountModel.getAccountById(userId);
    if (!user) return res.status(404).json(error("Không tìm thấy người dùng"));

    // Parse address nếu là JSON, nếu không thì trả về như string
    let address = user.Address || "";
    let addressData = null;
    
    if (address) {
      try {
        const parsed = JSON.parse(address);
        if (parsed && typeof parsed === 'object' && parsed.fullAddress !== undefined) {
          // Đây là structured address data
          addressData = {
            provinceId: parsed.provinceId || null,
            districtId: parsed.districtId || null,
            wardId: parsed.wardId || null,
            fullAddress: parsed.fullAddress || ""
          };
          address = parsed.fullAddress || parsed.detail || address;
        }
      } catch (e) {
        // Không phải JSON, dùng như string bình thường
        address = user.Address || "";
      }
    }

    return res.json(success("Lấy thông tin thành công", {
      id: user.AccountId,
      email: user.Email,
      userName: user.UserName,
      role: user.Role,
      avatar: user.Avatar,
      background: user.Background,
      coverImage: user.Background,
      phone: user.Phone,
      address: address,
      addressData: addressData, // Thêm structured address data
      bio: user.Bio,
      gender: user.Gender,
      status: user.Status,
      createdAt: user.created_at
    }));
  } catch (e) {
    console.error("me() error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

async function updateProfile(req, res) {
  console.log("=== updateProfile ===");
  console.log("[USER] req.user:", req.user);
  console.log("[USER] req.body:", req.body);
  console.log("[USER] req.files:", req.files);
  console.log("[USER] req.body.avatar:", req.body?.avatar);
  console.log("[USER] req.body.background:", req.body?.background);

  try {
    const userId = req.user.id;
    let { userName, bio, address, phone, gender, status, addressData } = req.body || {};

    // 🔒 Validate cơ bản
    userName = (userName || "").trim();
    if (userName && userName.length < 4)
      return res.status(400).json(error("Tên người dùng phải có ít nhất 4 ký tự"));

    bio = (bio || "").slice(0, 500);
    
    // Xử lý address: nếu có addressData (structured), lưu dưới dạng JSON
    // Nếu không, lưu như string bình thường
    let addressToSave = (address || "").trim();
    if (addressData) {
      try {
        // Parse addressData nếu là string JSON
        const addressDataObj = typeof addressData === 'string' 
          ? JSON.parse(addressData) 
          : addressData;
        
        // Lưu dưới dạng JSON string chứa cả full address và structured data
        addressToSave = JSON.stringify({
          fullAddress: address || addressDataObj.fullAddress || "",
          provinceId: addressDataObj.provinceId || null,
          districtId: addressDataObj.districtId || null,
          wardId: addressDataObj.wardId || null,
          detail: addressDataObj.detail || address || ""
        });
      } catch (e) {
        console.warn("[USER] Failed to parse addressData, saving as plain string:", e);
        // Nếu parse lỗi, lưu như string bình thường
        addressToSave = (address || "").trim();
      }
    }
    
    phone = (phone || "").replace(/\s/g, "").slice(0, 20);
    if (phone) {
      // Normalize phone: convert +84 to 0, or 84 to 0
      let normalizedPhone = phone;
      if (normalizedPhone.startsWith('+84')) {
        normalizedPhone = '0' + normalizedPhone.substring(3);
      } else if (normalizedPhone.startsWith('84') && normalizedPhone.length >= 10) {
        normalizedPhone = '0' + normalizedPhone.substring(2);
      }
      
      // Validate Vietnamese phone: 10-11 digits starting with 0
      const isVietnameseFormat = /^0\d{9,10}$/.test(normalizedPhone);
      
      // Validate international format: + followed by country code and 6-14 digits
      // Accept +84xxxxxxxxx (Vietnam) or other international formats
      const isInternationalFormat = /^\+[1-9]\d{6,14}$/.test(phone) || 
                                     /^\+84\d{9,10}$/.test(phone); // Vietnam international format
      
      if (!isVietnameseFormat && !isInternationalFormat) {
        console.log('[USER] Phone validation failed:', { phone, normalizedPhone, isVietnameseFormat, isInternationalFormat });
        return res.status(400).json(error("Số điện thoại không hợp lệ"));
      }
      
      // Use normalized phone for storage (Vietnamese format if possible)
      phone = isVietnameseFormat ? normalizedPhone : phone;
    }

    gender = gender?.toLowerCase() || null;
    if (gender && !["male", "female"].includes(gender))
      return res.status(400).json(error("Giới tính không hợp lệ"));



    const current = await accountModel.getAccountById(userId);
    if (!current) return res.status(404).json(error("Không tìm thấy người dùng"));
    
    // Check if avatar/background are in files (uploaded) or body (URL)
    const fileAvatar = req.files?.avatar?.[0]?.path;
    const fileBackground = req.files?.background?.[0]?.path;
    
    // If no files uploaded, check if URLs are in body
    const avatarUrl = req.body?.avatar || fileAvatar;
    const backgroundUrl = req.body?.background || fileBackground;
    
    console.log("[USER] fileAvatar:", fileAvatar);
    console.log("[USER] fileBackground:", fileBackground);
    console.log("[USER] avatarUrl:", avatarUrl);
    console.log("[USER] backgroundUrl:", backgroundUrl);
    console.log("[USER] current.Avatar:", current.Avatar);
    console.log("[USER] current.Background:", current.Background);

    const updateData = {
      userName: userName || current.UserName,
      bio,
      address: addressToSave,
      phone,
      gender: gender || current.Gender,
      status: status || current.Status,
      avatar: avatarUrl || current.Avatar,
      background: backgroundUrl || current.Background,
    };
    
    console.log("[USER] updateData:", updateData);

    const updated = await accountModel.updateAccountInfo(userId, updateData);
    if (!updated) return res.status(400).json(error("Cập nhật thất bại"));

    // Parse address để trả về structured data nếu có
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
        // Không phải JSON, dùng như string
        parsedAddress = updated.Address || "";
      }
    }

    return res.json(success("Cập nhật hồ sơ thành công", {
      id: updated.AccountId,
      email: updated.Email,
      userName: updated.UserName,
      role: updated.Role,
      avatar: updated.Avatar,
      background: updated.Background,
      phone: updated.Phone,
      address: parsedAddress,
      addressData: parsedAddressData, // Thêm structured address data
      bio: updated.Bio,
      gender: updated.Gender,
      status: updated.Status,
      createdAt: updated.created_at
    }));
  } catch (e) {
    console.error("updateProfile error:", e);
    return res.status(500).json(error(e?.message || "Lỗi máy chủ"));
  }
}
async function getEntities(req, res) {
  try {
    const accountId = req.params.accountId;
    if (!accountId) return res.status(400).json(error("Thiếu accountId"));

    const entities = await entityAccountModel.getEntitiesByAccountId(accountId);

    return res.json(entities); // trả về mảng entity đã normalize từ model
  } catch (err) {
    console.error("getEntities error:", err);
    return res.status(500).json(error("Lỗi server khi lấy entities"));
  }
}
async function getEntityAccountId(req, res) {
  try {
    const { accountId } = req.params;
    if (!accountId) return res.status(400).json(error("Thiếu accountId"));

    console.log("[getEntityAccountId] Request for AccountId:", accountId);
    const entityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(accountId);
    console.log("[getEntityAccountId] Result:", entityAccountId);
    
    if (!entityAccountId) {
      console.error("[getEntityAccountId] EntityAccountId is null after getEntityAccountIdByAccountId");
      return res.status(404).json(error("Không tìm thấy EntityAccountId. Có thể EntityAccount chưa được tạo."));
    }

    const entityAccountIdStr = String(entityAccountId);
    console.log("[getEntityAccountId] Returning EntityAccountId:", entityAccountIdStr);
    return res.json(success("Lấy EntityAccountId thành công", { EntityAccountId: entityAccountIdStr }));
  } catch (err) {
    console.error("getEntityAccountId error:", err);
    console.error("getEntityAccountId error stack:", err.stack);
    return res.status(500).json(error("Lỗi server khi lấy EntityAccountId: " + (err.message || "Unknown error")));
  }
}

module.exports = { me, updateProfile, getEntities, getEntityAccountId };

// Public: resolve entity summary by EntityAccountId
module.exports.getByEntityId = async (req, res) => {
  try {
    const { entityAccountId } = req.params;
    console.log('[getByEntityId] Requested EntityAccountId:', entityAccountId);
    
    const pool = await getPool();
    const ea = await pool.request()
      .input("id", sql.UniqueIdentifier, entityAccountId)
      .query("SELECT TOP 1 EntityType, EntityId FROM EntityAccounts WHERE EntityAccountId = @id");
    
    console.log('[getByEntityId] Query result count:', ea.recordset.length);
    
    if (ea.recordset.length === 0) {
      // Log for debugging - check if EntityAccountId exists in any form
      console.log('[getByEntityId] EntityAccountId not found in EntityAccounts table:', entityAccountId);
      return res.status(404).json({ success: false, message: "Entity not found" });
    }
    const { EntityType, EntityId } = ea.recordset[0];
    console.log('[getByEntityId] Found EntityType:', EntityType, 'EntityId:', EntityId);
    
    if (EntityType === 'BarPage') {
      const r = await pool.request().input("eid", sql.UniqueIdentifier, EntityId).query(
        "SELECT BarName AS name, Avatar AS avatar, Background AS background, Role AS role, Email, PhoneNumber AS phone FROM BarPages WHERE BarPageId = @eid"
      );
      console.log('[getByEntityId] BarPage query result count:', r.recordset.length);
      
      if (r.recordset.length === 0) {
        console.error('[getByEntityId] BarPage not found with BarPageId:', EntityId);
        return res.status(404).json({ success: false, message: "BarPage not found" });
      }
      
      const row = r.recordset[0];
      console.log('[getByEntityId] BarPage row data:', { 
        name: row.name, 
        BarName: row.name, 
        avatar: row.avatar,
        hasName: !!row.name 
      });
      
      if (!row.name) {
        console.warn('[getByEntityId] ⚠️ BarPage BarName is NULL or empty for BarPageId:', EntityId);
      }
      
      return res.json({ success: true, data: { entityId: entityAccountId, type: 'BAR', name: row.name, avatar: row.avatar, background: row.background, role: row.role || 'Bar', bio: '', contact: { email: row.Email || null, phone: row.phone || null } } });
    }
    if (EntityType === 'BusinessAccount') {
      // Query without Bio first to avoid column error
      const r = await pool.request().input("eid", sql.UniqueIdentifier, EntityId).query(
        "SELECT UserName AS name, Avatar AS avatar, Background AS background, Role AS role, Address, Phone FROM BussinessAccounts WHERE BussinessAccountId = @eid"
      );
      console.log('[getByEntityId] BusinessAccount query result count:', r.recordset.length);
      
      if (r.recordset.length === 0) {
        console.error('[getByEntityId] BusinessAccount not found with BussinessAccountId:', EntityId);
        return res.status(404).json({ success: false, message: "BusinessAccount not found" });
      }
      
      const row = r.recordset[0];
      console.log('[getByEntityId] BusinessAccount row data:', { 
        name: row.name, 
        UserName: row.name, 
        avatar: row.avatar,
        hasName: !!row.name 
      });
      
      if (!row.name) {
        console.warn('[getByEntityId] ⚠️ BusinessAccount UserName is NULL or empty for BussinessAccountId:', EntityId);
      }
      
      let address = row.Address || null;
      if (address) {
        try {
          const parsed = JSON.parse(address);
          address = parsed?.fullAddress || parsed?.detail || address;
        } catch {}
      }
      // Bio column may not exist in database, use empty string as default
      const bio = '';
      return res.json({ success: true, data: { entityId: entityAccountId, type: (row.role || '').toUpperCase() || 'USER', name: row.name, avatar: row.avatar, background: row.background, role: row.role, bio: bio, contact: { email: null, phone: row.Phone || null, address } } });
    }
    // Default Account
    const r = await pool.request().input("eid", sql.UniqueIdentifier, EntityId).query(
      "SELECT UserName AS name, Avatar AS avatar, Background AS background, Role AS role, Bio, Address, Phone, Email FROM Accounts WHERE AccountId = @eid"
    );
    console.log('[getByEntityId] Account query result count:', r.recordset.length);
    
    if (r.recordset.length === 0) {
      console.error('[getByEntityId] Account not found with AccountId:', EntityId);
      return res.status(404).json({ success: false, message: "Account not found" });
    }
    
    const row = r.recordset[0];
    console.log('[getByEntityId] Account row data:', { 
      name: row.name, 
      UserName: row.name, 
      avatar: row.avatar,
      hasName: !!row.name 
    });
    
    if (!row.name) {
      console.warn('[getByEntityId] ⚠️ Account UserName is NULL or empty for AccountId:', EntityId);
    }
    
    let address = row.Address || null;
    if (address) {
      try {
        const parsed = JSON.parse(address);
        address = parsed?.fullAddress || parsed?.detail || address;
      } catch {}
    }
    return res.json({ success: true, data: { entityId: entityAccountId, type: 'USER', name: row.name, avatar: row.avatar, background: row.background, role: row.role, bio: row.Bio || '', contact: { email: row.Email || null, phone: row.Phone || null, address } } });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Server error', error: e.message });
  }
};

