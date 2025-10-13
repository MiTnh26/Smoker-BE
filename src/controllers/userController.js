const { accountModel } = require("../models");
const { success, error } = require("../utils/response");

async function me(req, res) {
  try {
    const userId = req.user.id;
    const user = await accountModel.getAccountById(userId);
    if (!user) return res.status(404).json(error("Không tìm thấy người dùng"));
    return res.json(
      success("Lấy thông tin thành công", {
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
        status: user.Status,
      })
    );
  } catch (e) {
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { userName, avatar, background, coverImage, bio, address, phone } = req.body || {};
    const updated = await accountModel.updateAccountInfo(userId, {
      userName,
      avatar,
      background: background || coverImage || null,
      bio,
      address,
      phone,
    });
    return res.json(
      success("Cập nhật hồ sơ thành công", {
        id: updated.AccountId,
        email: updated.Email,
        userName: updated.UserName,
        role: updated.Role,
        avatar: updated.Avatar,
        background: updated.Background,
        coverImage: updated.Background,
        phone: updated.Phone,
        address: updated.Address,
        bio: updated.Bio,
        status: updated.Status,
      })
    );
  } catch (e) {
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

module.exports = { me, updateProfile };


