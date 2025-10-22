
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { accountModel } = require("../models");
const { isValidEmail, isValidPassword, isGmailEmail } = require("../utils/validator");
const { generateRandomPassword } = require("../utils/password");
const { sendMail } = require("../utils/mailer");

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

// Register bình thường
async function registerService(email, password, confirmPassword) {
  if (!isValidEmail(email) || !isGmailEmail(email)) throw new Error("Email phải là Gmail hợp lệ");
  if (!isValidPassword(password)) throw new Error("Mật khẩu không hợp lệ");
  if (password !== confirmPassword) throw new Error("Xác nhận mật khẩu không khớp");

  const existing = await accountModel.findAccountByEmail(email);
  if (existing) {
    const err = new Error("Email đã tồn tại");
    err.code = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(password, 10);
  const created = await accountModel.createAccount({ email, hashedPassword: hashed, role: "customer", status: "active" });
  return { id: created.AccountId, email: created.Email };
}

// Google register (random password + mail)
async function googleRegisterService({ email }) {
  if (!email) throw new Error("Thiếu email");
  if (!isValidEmail(email) || !isGmailEmail(email)) throw new Error("Email không hợp lệ");

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
async function googleLoginService({ email }) {
  if (!email) throw new Error("Thiếu email");
  if (!isValidEmail(email) || !isGmailEmail(email))
    throw new Error("Email không hợp lệ");

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
}



module.exports = { registerService, googleRegisterService, loginService,googleLoginService };
