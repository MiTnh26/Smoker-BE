
const authService = require("../services/authService");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const { accountModel } = require("../models");
require("dotenv").config();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function register(req, res) {
  try {
    const { email, password, confirmPassword } = req.body;
    const created = await authService.registerService(email, password, confirmPassword);
    return res.status(201).json({ message: "Đăng ký thành công", user: created });
  } catch (err) {
    const status = err.code === 409 ? 409 : 400;
    return res.status(status).json({ message: err.message || "Đăng ký thất bại" });
  }
}

async function googleRegister(req, res) {
  try {
    const { email } = req.body || {};
    const data = await authService.googleRegisterService({ email });
    // Trả trực tiếp object service trả
    return res.status(201).json(data);
  } catch (err) {
    const status = err.code === 409 ? 409 : 400;
    const message = err.message || "Đăng ký thất bại";
    return res.status(status).json({ message });
  }
}


async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await authService.loginService(email, password);
    return res.json({
      message: "Đăng nhập thành công",
      token: result.token,
      needProfile: !result.profileComplete,
      user: result.user,
    });
  } catch (err) {
    return res.status(401).json({ message: err.message || "Đăng nhập thất bại" });
  }
}
console.log("authService object:", authService); 

async function googleOAuthLogin(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Thiếu Google ID token" });

    // Xác thực token với Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;

    // Kiểm tra user trong DB
    let user = await accountModel.findAccountByEmail(email);
    let newUser = false;
    if (!user) {
      // Tạo user mới
      user = await accountModel.createAccount({
        email,
        role: "user",
        userName: name,
      });
      newUser = true;
    }

    // Tạo JWT
    const token = jwt.sign(
      { id: user.AccountId, email: user.Email, role: user.Role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      status: newUser ? "NEW_USER" : "EXISTING_USER",
      message: newUser ? "Đăng ký/đăng nhập bằng Google thành công" : "Đăng nhập bằng Google thành công",
      token,
      user: {
        id: user.AccountId,
        email: user.Email,
        userName: user.UserName,
      },
    });
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(401).json({ message: "Xác thực Google thất bại" });
  }
}



module.exports = { register, googleRegister, login, googleOAuthLogin };
