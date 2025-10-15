const sql = require("mssql");
const { getPool } = require("../db/sqlserver");

async function createBusinessAccount({
  accountId,
  userName,
  role,
  phone = null,
  address = null,
  bio = null,
  avatar = null,      // sẽ lưu null lúc tạo account
  background = null,  // sẽ lưu null lúc tạo account
  bankInfoId = null,
  status = "pending",
}) {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("UserName", sql.NVarChar(100), userName)
    .input("Role", sql.NVarChar(50), role)
    .input("Phone", sql.NVarChar(50), phone)
    .input("Address", sql.NVarChar(255), address)
    .input("Bio", sql.NVarChar(sql.MAX), bio)
    .input("Avatar", sql.NVarChar(1000), avatar)
    .input("Background", sql.NVarChar(1000), background)
    .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
    .input("Status", sql.NVarChar(20), status)
    .query(`
      INSERT INTO BussinessAccounts (
        AccountId, UserName, Role, Phone, Address, Bio, Avatar, Background, BankInfoId, Status
      )
      OUTPUT inserted.BussinessAccountId, inserted.AccountId, inserted.UserName, inserted.Role, inserted.Status
      VALUES (
        @AccountId, @UserName, @Role, @Phone, @Address, @Bio, @Avatar, @Background, @BankInfoId, @Status
      )
    `);

  // trả về object có BussinessAccountId
  return result.recordset[0];
}

// Cập nhật avatar/background sau khi upload xong
async function updateBusinessAccountFiles(BussinessAccountId, files) {
  const pool = await getPool();
  const avatar = files?.avatar || null;
  const background = files?.background || null;

  await pool
    .request()
    .input("BussinessAccountId", sql.UniqueIdentifier, BussinessAccountId)
    .input("Avatar", sql.NVarChar(1000), avatar)
    .input("Background", sql.NVarChar(1000), background)
    .query(`
      UPDATE BussinessAccounts
      SET Avatar = @Avatar, Background = @Background
      WHERE BussinessAccountId = @BussinessAccountId
    `);

  return { avatar, background };
}

module.exports = { createBusinessAccount, updateBusinessAccountFiles };
