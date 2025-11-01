


const { accountModel,entityAccountModel } = require("../models");
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
    if (phone && !/^0\d{9,10}$/.test(phone))
      return res.status(400).json(error("Số điện thoại không hợp lệ"));

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
module.exports = { me, updateProfile,getEntities };

