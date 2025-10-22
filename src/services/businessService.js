const bcrypt = require("bcrypt");
const { accountModel } = require("../models");
const { createBusinessAccount } = require("../models/businessAccountModel");
const { isValidEmail, isValidPassword } = require("../utils/validator");

async function registerBusinessAccount({
  email,
  password,
  confirmPassword,
  role, // bar | dj | dancer
  userName,
  phone,
  address,
  bio,
}) {
  if (!isValidEmail(email)) throw new Error("Email không hợp lệ");
  if (!isValidPassword(password)) throw new Error("Mật khẩu không hợp lệ");
  if (password !== confirmPassword) throw new Error("Xác nhận mật khẩu không khớp");
  if (!role || !["bar", "dj", "dancer"].includes(role)) throw new Error("Role không hợp lệ");
  if (!userName) throw new Error("Thiếu tên hiển thị");

  const existing = await accountModel.findAccountByEmail(email);
  if (existing) {
    const err = new Error("Email đã tồn tại");
    err.code = 409;
    throw err;
  }

  const hashed = await bcrypt.hash(password, 10);
  const account = await accountModel.createAccount({ email, hashedPassword: hashed, role, status: "active", userName });

  const business = await createBusinessAccount({
    accountId: account.AccountId,
    userName,
    role,
    phone,
    address,
    bio,
    status: "pending",
  });

  return { account, business };
}

module.exports = { registerBusinessAccount };


