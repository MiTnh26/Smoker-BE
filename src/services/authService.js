const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { accountModel } = require("../models");
const { createEntityAccount } = require("../models/entityAccountModel");
const { isValidEmail, isValidPassword, isGmailEmail } = require("../utils/validator");
const { generateRandomPassword } = require("../utils/password");
const { sendMail } = require("../utils/mailer");
const { verifyEmailExists, isFakeEmail } = require("../utils/emailVerifier");
const { generateDisplayNameFromEmail, generateAvatarFromEmail } = require("../utils/emailHelper");

// Biến toàn cục lưu OTP theo email
const otpMap = new Map(); // key: email, value: { otp, expires }
// const sql = require("mssql");

function signJwt(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function buildUserResponse(user) {
  return {
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
  };
}




// Pre-check register: validate input & check email tồn tại nhưng KHÔNG tạo tài khoản
async function precheckRegisterService(email, password, confirmPassword) {
  if (!isValidEmail(email)) throw new Error("Email phải là Gmail hợp lệ");
  if (!isValidPassword(password)) throw new Error("Mật khẩu không hợp lệ");
  if (password !== confirmPassword) throw new Error("Xác nhận mật khẩu không khớp");

  // Kiểm tra email có pattern không hợp lệ (email giả)
  if (isFakeEmail(email)) {
    const err = new Error("Email không hợp lệ hoặc không tồn tại");
    err.code = 400;
    throw err;
  }

  // Kiểm tra email có tồn tại thực sự (kiểm tra MX record)
  const emailVerification = await verifyEmailExists(email);
  if (!emailVerification.valid) {
    const err = new Error(emailVerification.reason || "Email không tồn tại");
    err.code = 400;
    throw err;
  }

  const existing = await accountModel.findAccountByEmail(email);
  if (existing) {
    const err = new Error("Email đã tồn tại");
    err.code = 409;
    throw err;
  }

  // Không tạo tài khoản ở đây, chỉ báo OK để FE hiển thị popup 18+
  return true;
}

// Register bình thường (thực sự tạo tài khoản, gọi sau khi user xác nhận 18+)
async function registerService(email, password, confirmPassword) {
  if (!isValidEmail(email)) throw new Error("Email phải là Gmail hợp lệ");
  if (!isValidPassword(password)) throw new Error("Mật khẩu không hợp lệ");
  if (password !== confirmPassword) throw new Error("Xác nhận mật khẩu không khớp");

  const existing = await accountModel.findAccountByEmail(email);
  if (existing) {
    const err = new Error("Email đã tồn tại");
    err.code = 409;
    throw err;
  }
  
  // Tạo tên và avatar tự động từ email
  const userName = generateDisplayNameFromEmail(email);
  const avatar = generateAvatarFromEmail(email, userName);
  
  const hashed = await bcrypt.hash(password, 10);
  const created = await accountModel.createAccount({ 
    email, 
    hashedPassword: hashed, 
    userName: userName,
    avatar: avatar,
    role: "customer", 
    status: "active" 
  });
  
  // EntityAccounts sau khi tạo tài khoản
  if (created?.AccountId) {
    await createEntityAccount("Account", created.AccountId, created.AccountId);
  }

  return { id: created.AccountId, email: created.Email };
}






// Google register (random password + mail)
async function googleRegisterService({ email }) {
  if (!email) throw new Error("Thiếu email");
  if (!isValidEmail(email)) throw new Error("Email không hợp lệ");

  let user = await accountModel.findAccountByEmail(email);
  if (!user) {
    const randomPass = generateRandomPassword(10);
    const hashed = await bcrypt.hash(randomPass, 10);
    // ✅ Tạo account mới
    const created = await accountModel.createAccount({
      email,
      hashedPassword: hashed,
      role: "customer",
      status: "active",
    });
    if (created?.AccountId) {
      await createEntityAccount("Account", created.AccountId, created.AccountId);
    }


    console.log("Random password for", email, ":", randomPass);

    try {
      await sendMail({
        to: email,
        subject: "Tài khoản Smoker - Xác thực Gmail",
        html: `<p>Bạn đã xác thực Gmail thành công.</p>
               <p>Mật khẩu tạm thời của bạn: <b>${randomPass}</b></p>
               <p>Vui lòng dùng mật khẩu này để đăng nhập thủ công lần đầu.</p>`,
      });
    } catch (e) {
      console.error("Mail send failed:", e);
      throw new Error("Không gửi được mail, vui lòng thử lại");
    }

    return { status: "NEW_USER", message: "Hệ thống đã gửi mật khẩu random về Gmail" };
  }

  return { status: "EXISTING_USER", message: "Tài khoản Gmail đã tồn tại, vui lòng đăng nhập bằng mật khẩu" };
}


// Login
async function loginService(email, password) {
  const user = await accountModel.findAccountByEmail(email);
  if (!user) throw new Error("Tài khoản không tồn tại");

  const isMatch = await bcrypt.compare(password, user.Password);
  if (!isMatch) throw new Error("Sai mật khẩu");

  await accountModel.updateLastLogin(user.AccountId);

  const token = signJwt({ id: user.AccountId, email: user.Email, role: user.Role });
  const profileComplete = accountModel.hasProfileComplete(user);
  return { token, user: buildUserResponse(user), profileComplete };
}
async function googleLoginService({ email, userName = null, avatar = null, phone = null }) {
  if (!email) throw new Error("Thiếu email");
  if (!isValidEmail(email))
    throw new Error("Email không hợp lệ");

  let user = await accountModel.findAccountByEmail(email);
  let isNewUser = false;

  // ✅ Nếu chưa có tài khoản, tự động đăng ký
  if (!user) {
    const randomPass = generateRandomPassword(10);
    const hashed = await bcrypt.hash(randomPass, 10);
    
    // ✅ Tạo account mới với thông tin từ Google (bao gồm số điện thoại nếu có)
    const created = await accountModel.createAccount({
      email,
      hashedPassword: hashed,
      userName: userName || null,
      avatar: avatar || null,
      phone: phone || null,
      role: "customer",
      status: "active",
    });
    
    if (created?.AccountId) {
      await createEntityAccount("Account", created.AccountId, created.AccountId);
    }

    user = created;
    isNewUser = true;

    // ✅ Gửi mã về email để đăng nhập thủ công
    try {
      await sendMail({
        to: email,
        subject: "Tài khoản Smoker - Xác thực Gmail",
        html: `<p>Bạn đã đăng ký thành công bằng Google.</p>
               <p>Mật khẩu tạm thời của bạn: <b>${randomPass}</b></p>
               <p>Vui lòng dùng mật khẩu này để đăng nhập thủ công nếu cần.</p>`,
      });
    } catch (e) {
      console.error("Mail send failed:", e);
      // Không throw error, vì đăng ký đã thành công
    }
  } else {
    // ✅ Nếu đã có tài khoản, chỉ cập nhật thông tin từ Google nếu user chưa có
    // Điều này tránh ghi đè thông tin mà user đã tự thay đổi trong hệ thống
    const updates = {};
    
    // Chỉ cập nhật userName từ Google nếu user chưa có tên
    if (userName && (!user.UserName || user.UserName.trim() === "")) {
      updates.userName = userName;
    }
    
    // Chỉ cập nhật avatar từ Google nếu user chưa có ảnh
    if (avatar && (!user.Avatar || user.Avatar.trim() === "")) {
      updates.avatar = avatar;
    }
    
    // Cập nhật phone nếu chưa có và Google cung cấp
    if (phone && (!user.Phone || user.Phone.trim() === "")) {
      updates.phone = phone;
    }
    
    // Nếu có thông tin cần cập nhật
    if (Object.keys(updates).length > 0) {
      await accountModel.updateAccountInfo(user.AccountId, updates);
      // Cập nhật lại user object để trả về thông tin mới nhất
      user = await accountModel.findAccountByEmail(email);
    }
  }

  await accountModel.updateLastLogin(user.AccountId);

  const token = signJwt({
    id: user.AccountId,
    email: user.Email,
    role: user.Role,
  });
  const profileComplete = accountModel.hasProfileComplete(user);
  return { 
    token, 
    user: buildUserResponse(user), 
    profileComplete,
    isNewUser 
  };
}



async function forgotPasswordService(email) {
  if (!email) throw new Error("Email là bắt buộc");
  if (!isValidEmail(email)) throw new Error("Email không hợp lệ");

  const user = await accountModel.findAccountByEmail(email);
  if (!user) throw new Error("Email không tồn tại trong hệ thống");

  // Tạo OTP ngẫu nhiên 6 số
  const otp = Math.floor(100000 + Math.random() * 900000);
  const expires = Date.now() + 5 * 60 * 1000; // 5 phút
  otpMap.set(email, { otp, expires });

  // Gửi mail với OTP
  await sendMail({
    to: email,
    subject: "Smoker - Mã xác thực OTP quên mật khẩu",
    html: `
      <p>Bạn đã yêu cầu khôi phục mật khẩu.</p>
      <p>Mã OTP của bạn là: <b>${otp}</b></p>
      <p>OTP có hiệu lực trong 5 phút. Vui lòng nhập OTP để xác minh và đổi mật khẩu.</p>
    `
  });

  return true;
}

// Gửi OTP cho đăng ký tài khoản
async function sendRegisterOtpService(email) {
  if (!email) throw new Error("Email là bắt buộc");
  if (!isValidEmail(email)) throw new Error("Email không hợp lệ");

  // Kiểm tra email đã tồn tại chưa
  const existing = await accountModel.findAccountByEmail(email);
  if (existing) {
    const err = new Error("Email đã tồn tại");
    err.code = 409;
    throw err;
  }

  // Kiểm tra email có pattern không hợp lệ (email giả)
  if (isFakeEmail(email)) {
    const err = new Error("Email không hợp lệ hoặc không tồn tại");
    err.code = 400;
    throw err;
  }

  // Kiểm tra email có tồn tại thực sự (kiểm tra MX record)
  const emailVerification = await verifyEmailExists(email);
  if (!emailVerification.valid) {
    const err = new Error(emailVerification.reason || "Email không tồn tại");
    err.code = 400;
    throw err;
  }

  // Tạo OTP ngẫu nhiên 6 số
  const otp = Math.floor(100000 + Math.random() * 900000);
  const expires = Date.now() + 5 * 60 * 1000; // 5 phút
  otpMap.set(email, { otp, expires });

  // Gửi mail với OTP
  await sendMail({
    to: email,
    subject: "Smoker - Mã xác thực OTP đăng ký tài khoản",
    html: `
      <p>Bạn đã yêu cầu đăng ký tài khoản Smoker.</p>
      <p>Mã OTP của bạn là: <b>${otp}</b></p>
      <p>OTP có hiệu lực trong 5 phút. Vui lòng nhập OTP để xác minh email và tiếp tục đăng ký.</p>
    `
  });

  return true;
}

async function changePasswordService(userId, currentPassword, newPassword) {
  console.log('Changing password for userId:', userId);

  if (!userId) {
    throw new Error("Thiếu thông tin người dùng");
  }

  const user = await accountModel.getAccountById(userId);
  console.log('Found user:', user);

  if (!user) throw new Error("Người dùng không tồn tại");

  // Kiểm tra mật khẩu hiện tại
  const isMatch = await bcrypt.compare(currentPassword, user.Password);
  if (!isMatch) throw new Error("Mật khẩu hiện tại không đúng");

  // Validate mật khẩu mới
  if (!isValidPassword(newPassword)) {
    throw new Error("Mật khẩu mới không hợp lệ");
  }

  // Hash và cập nhật mật khẩu mới
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await accountModel.updatePassword(userId, hashedPassword);

  return true;
}

async function facebookLoginService(accessToken) {
  try {
    // Gọi Facebook Graph API để lấy thông tin người dùng
    const response = await fetch(`https://graph.facebook.com/me?fields=email&access_token=${accessToken}`);
    const data = await response.json();

    if (!data.email) {
      throw new Error("Không thể lấy email từ tài khoản Facebook");
    }

    const email = data.email;
    const user = await accountModel.findAccountByEmail(email);

    if (!user) {
      const err = new Error("Tài khoản chưa tồn tại. Vui lòng đăng ký trước.");
      err.code = 404;
      throw err;
    }

    await accountModel.updateLastLogin(user.AccountId);

    const token = signJwt({
      id: user.AccountId,
      email: user.Email,
      role: user.Role,
    });

    const profileComplete = accountModel.hasProfileComplete(user);
    return { token, user: buildUserResponse(user), profileComplete };
  } catch (error) {
    console.error("Facebook login error:", error);
    throw error;
  }
}

async function facebookRegisterService({ email }) {
  if (!email) throw new Error("Thiếu email");
  if (!isValidEmail(email)) throw new Error("Email không hợp lệ");

  let user = await accountModel.findAccountByEmail(email);
  if (!user) {
    const randomPass = generateRandomPassword(10);
    const hashed = await bcrypt.hash(randomPass, 10);
    await accountModel.createAccount({
      email,
      hashedPassword: hashed,
      role: "customer",
      status: "active",
    });

    try {
      await sendMail({
        to: email,
        subject: "Tài khoản Smoker - Xác thực Facebook",
        html: `<p>Bạn đã xác thực Facebook thành công.</p>
               <p>Mật khẩu tạm thời của bạn: <b>${randomPass}</b></p>
               <p>Vui lòng dùng mật khẩu này để đăng nhập thủ công lần đầu.</p>`,
      });
    } catch (e) {
      console.error("Mail send failed:", e);
      throw new Error("Không gửi được mail, vui lòng thử lại");
    }

    return { status: "NEW_USER", message: "Hệ thống đã gửi mật khẩu random về email" };
  }

  return { status: "EXISTING_USER", message: "Tài khoản đã tồn tại, vui lòng đăng nhập" };
}

async function verifyOtpService(email, otpInput) {
  if (!email || !otpInput) throw new Error("Thiếu thông tin xác thực");
  const data = otpMap.get(email);
  if (!data) throw new Error("OTP không tồn tại hoặc đã hết hạn");
  if (Date.now() > data.expires) {
    otpMap.delete(email);
    throw new Error("OTP đã hết hạn");
  }
  if (String(data.otp) !== String(otpInput)) throw new Error("OTP không đúng");
  
  otpMap.delete(email);
 
  return true;
}

async function resetPasswordService(email, newPassword, confirmPassword) {
  if (!email || !newPassword || !confirmPassword) throw new Error("Thiếu thông tin bắt buộc");
  if (newPassword !== confirmPassword) throw new Error("Mật khẩu mới không khớp");
  if (!isValidPassword(newPassword)) throw new Error("Mật khẩu mới không hợp lệ");
  const user = await accountModel.findAccountByEmail(email);
  if (!user) throw new Error("Email không tồn tại trong hệ thống");

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await accountModel.updatePassword(user.AccountId, hashedPassword);
  return true;
}
module.exports = {
  precheckRegisterService,
  registerService,
  googleRegisterService,
  loginService,
  googleLoginService,
  forgotPasswordService,
  sendRegisterOtpService,
  changePasswordService,
  facebookLoginService,
  facebookRegisterService,
  verifyOtpService,
  resetPasswordService
};
