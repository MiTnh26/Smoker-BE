


const { accountModel,entityAccountModel } = require("../models");
const { success, error } = require("../utils/response");

async function me(req, res) {
  try {
    const userId = req.user.id;
    const user = await accountModel.getAccountById(userId);
    if (!user) return res.status(404).json(error("Không tìm thấy người dùng"));

    return res.json(success("Lấy thông tin thành công", {
      id: user.AccountId,
      email: user.Email,
      userName: user.UserName,
      role: user.Role,
      avatar: user.Avatar,
      background: user.Background,
      coverImage: user.Background,
      phone: user.Phone,
      address: user.Address,
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
    let { userName, bio, address, phone, gender, status } = req.body || {};

    // 🔒 Validate cơ bản
    userName = (userName || "").trim();
    if (userName && userName.length < 4)
      return res.status(400).json(error("Tên người dùng phải có ít nhất 4 ký tự"));

    bio = (bio || "").slice(0, 500);
    address = (address || "").trim();
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
      address,
      phone,
      gender: gender || current.Gender,
      status: status || current.Status,
      avatar: avatarUrl || current.Avatar,
      background: backgroundUrl || current.Background,
    };
    
    console.log("[USER] updateData:", updateData);

    const updated = await accountModel.updateAccountInfo(userId, updateData);
    if (!updated) return res.status(400).json(error("Cập nhật thất bại"));

    return res.json(success("Cập nhật hồ sơ thành công", {
      id: updated.AccountId,
      email: updated.Email,
      userName: updated.UserName,
      role: updated.Role,
      avatar: updated.Avatar,
      background: updated.Background,
      phone: updated.Phone,
      address: updated.Address,
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

