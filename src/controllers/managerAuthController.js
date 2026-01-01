const managerModel = require("../models/managerModel");
const jwt = require("jsonwebtoken");
const { success, error } = require("../utils/response");

/**
 * Đăng ký Manager mới
 */
async function register(req, res) {
  try {
    const { email, password, role, phone } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json(error("Email và password là bắt buộc"));
    }

    if (password.length < 8) {
      return res.status(400).json(error("Password phải có ít nhất 8 ký tự"));
    }

    if (!email.includes("@")) {
      return res.status(400).json(error("Email không hợp lệ"));
    }

    // Kiểm tra email đã tồn tại chưa
    const exists = await managerModel.managerExists(email);
    if (exists) {
      return res.status(400).json(error("Email đã tồn tại"));
    }

    // Tạo Manager
    const manager = await managerModel.createManager({
      email,
      password,
      role: role || "Admin",
      phone
    });

    // Tạo JWT token
    const token = jwt.sign(
      { 
        id: manager.ManagerId,
        email: manager.Email,
        role: manager.Role,
        type: "manager"
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    return res.status(201).json(success("Đăng ký thành công", {
      token,
      manager: {
        id: manager.ManagerId,
        email: manager.Email,
        role: manager.Role,
        phone: manager.Phone,
        status: manager.Status
      }
    }));
  } catch (err) {
    console.error("Manager register error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
}

/**
 * Đăng nhập Manager
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json(error("Email và password là bắt buộc"));
    }

    // Lấy Manager
    const manager = await managerModel.getManagerByEmail(email);
    if (!manager) {
      return res.status(401).json(error("Email hoặc password không đúng"));
    }

    // Kiểm tra status
    if (manager.Status !== "active") {
      return res.status(403).json(error("Tài khoản đã bị khóa"));
    }

    // Verify password
    const isValid = await managerModel.verifyPassword(manager, password);
    if (!isValid) {
      return res.status(401).json(error("Email hoặc password không đúng"));
    }

    // Tạo JWT token
    const token = jwt.sign(
      { 
        id: manager.ManagerId,
        email: manager.Email,
        role: manager.Role,
        type: "manager"
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    return res.json(success("Đăng nhập thành công", {
      token,
      manager: {
        id: manager.ManagerId,
        email: manager.Email,
        role: manager.Role,
        phone: manager.Phone,
        status: manager.Status
      }
    }));
  } catch (err) {
    console.error("Manager login error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
}

/**
 * Lấy thông tin Manager hiện tại
 */
async function getMe(req, res) {
  try {
    const managerId = req.user.id;
    const manager = await managerModel.getManagerById(managerId);
    
    if (!manager) {
      return res.status(404).json(error("Không tìm thấy Manager"));
    }

    return res.json(success("Lấy thông tin thành công", {
      id: manager.ManagerId,
      email: manager.Email,
      role: manager.Role,
      phone: manager.Phone,
      status: manager.Status,
      createdAt: manager.CreatedAt
    }));
  } catch (err) {
    console.error("Get manager me error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
}

module.exports = {
  register,
  login,
  getMe
};

