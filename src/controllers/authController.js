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

// Pre-check đăng ký: chỉ validate + check email tồn tại, KHÔNG tạo tài khoản
async function precheckRegister(req, res) {
  try {
    const { email, password, confirmPassword } = req.body;
    await authService.precheckRegisterService(email, password, confirmPassword);
    return res.json({ message: "OK" });
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

// Helper function để lấy số điện thoại từ Google People API
async function getPhoneFromPeopleAPI(accessToken) {
  try {
    const response = await fetch(
      `https://people.googleapis.com/v1/people/me?personFields=phoneNumbers`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.warn("[Google OAuth] Failed to fetch phone from People API:", response.status);
      return null;
    }

    const data = await response.json();
    const phoneNumbers = data.phoneNumbers || [];
    
    // Lấy số điện thoại đầu tiên có giá trị
    if (phoneNumbers.length > 0 && phoneNumbers[0].value) {
      return phoneNumbers[0].value;
    }
    
    return null;
  } catch (error) {
    console.warn("[Google OAuth] Error fetching phone from People API:", error.message);
    return null;
  }
}

async function googleOAuthLogin(req, res) {
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken)
      return res.status(400).json({ message: "Thiếu Google ID token" });

    // ✅ Xác thực token Google và lấy thông tin
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name || null;
    const picture = payload.picture || null;
    
    // Lấy số điện thoại: ưu tiên từ People API nếu có accessToken, sau đó từ payload
    let phone = payload.phone_number || null;
    
    // Nếu có access token, thử lấy số điện thoại từ People API
    if (accessToken && !phone) {
      phone = await getPhoneFromPeopleAPI(accessToken);
    }

    // ✅ Gọi service login/register qua Google (tự động đăng ký nếu chưa có)
    const result = await authService.googleLoginService({ 
      email, 
      userName: name, 
      avatar: picture,
      phone: phone
    });

    return res.json({
      message: result.isNewUser ? "Đăng ký Google thành công" : "Đăng nhập Google thành công",
      token: result.token,
      needProfile: !result.profileComplete,
      user: result.user,
      isNewUser: result.isNewUser || false,
    });
  } catch (err) {
    console.error("Google OAuth error:", err);
    res
      .status(err.code || 401)
      .json({ message: err.message || "Xác thực Google thất bại" });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email là bắt buộc" });
    }

    const result = await authService.forgotPasswordService(email);
    return res.json({ message: "Đã gửi email khôi phục mật khẩu" });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Khôi phục mật khẩu thất bại" });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user.id; // Lấy từ token auth middleware

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Mật khẩu mới không khớp" });
    }

    await authService.changePasswordService(userId, currentPassword, newPassword);
    return res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Đổi mật khẩu thất bại" });
  }
}

async function facebookOAuthLogin(req, res) {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: "Thiếu Facebook access token" });
    }

    const result = await authService.facebookLoginService(accessToken);
    return res.json({
      message: "Đăng nhập Facebook thành công",
      token: result.token,
      needProfile: !result.profileComplete,
      user: result.user,
    });
  } catch (err) {
    console.error("Facebook OAuth error:", err);
    res
      .status(err.code || 401)
      .json({ message: err.message || "Xác thực Facebook thất bại" });
  }
}

async function facebookRegister(req, res) {
  try {
    const { email } = req.body;
    const data = await authService.facebookRegisterService({ email });
    return res.status(201).json(data);
  } catch (err) {
    const status = err.code === 409 ? 409 : 400;
    const message = err.message || "Đăng ký thất bại";
    return res.status(status).json({ message });
  }
}

async function verifyOtp(req, res) {
  try {
    const { email, otp } = req.body;
    await authService.verifyOtpService(email, otp);
    return res.json({ message: "Xác thực OTP thành công" });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Xác thực OTP thất bại" });
  }
}

async function sendRegisterOtp(req, res) {
  try {
    const { email } = req.body;
    await authService.sendRegisterOtpService(email);
    return res.json({ message: "Đã gửi mã OTP về email" });
  } catch (err) {
    const status = err.code === 409 ? 409 : 400;
    return res.status(status).json({ message: err.message || "Gửi OTP thất bại" });
  }
}

async function resetPassword(req, res) {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    await authService.resetPasswordService(email, newPassword, confirmPassword);
    return res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Đổi mật khẩu thất bại" });
  }
}


module.exports = {
  precheckRegister,
  register,
  googleRegister,
  login,
  googleOAuthLogin,
  forgotPassword,
  sendRegisterOtp,
  changePassword,
  facebookOAuthLogin,
  facebookRegister,
  verifyOtp,
  resetPassword
};
