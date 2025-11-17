/*
 * CLI: Create an Admin account
 * Usage:
 *  node src/scripts/createAdmin.js            # interactive prompts
 *  ADMIN_EMAIL=admin@smoker.com ADMIN_PASSWORD=Admin123 node src/scripts/createAdmin.js  # env-based
 */
const readline = require("readline");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const { getPool, sql } = require("../db/sqlserver");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function ensureConnection() {
  try {
    await getPool();
  } catch (e) {
    console.error("❌ Cannot connect to SQL Server. Check DB config.", e.message);
    process.exit(1);
  }
}

async function adminExists(email) {
  const pool = await getPool();
  const res = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .query("SELECT TOP 1 AccountId FROM Accounts WHERE Email = @Email AND Role = 'Admin'");
  return res.recordset.length > 0;
}

async function createAdmin({ email, password, userName = "Admin" }) {
  const pool = await getPool();

  // Check duplicate email
  const dup = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .query("SELECT TOP 1 AccountId, Role FROM Accounts WHERE Email = @Email");
  if (dup.recordset.length) {
    const existingRole = dup.recordset[0].Role;
    if (String(existingRole).toLowerCase() === "admin") {
      console.log("ℹ️ Admin already exists with this email. Nothing to do.");
      return null;
    }
  }

  const hashed = await bcrypt.hash(password, 10);
  const insert = await pool.request()
    .input("Email", sql.NVarChar(100), email)
    .input("Password", sql.NVarChar(100), hashed)
    .input("Role", sql.NVarChar(50), "Admin")
    .input("UserName", sql.NVarChar(100), userName)
    .input("Status", sql.NVarChar(20), "active")
    .query(`
      INSERT INTO Accounts (Email, Password, Role, UserName, Status)
      OUTPUT inserted.AccountId, inserted.Email, inserted.UserName, inserted.Role
      VALUES (@Email, @Password, @Role, @UserName, @Status)
    `);

  const created = insert.recordset[0];
  console.log("✅ Admin created:", created.Email, "| role:", created.Role);
  return created;
}

(async function main() {
  await ensureConnection();

  // Prefer env, fall back to prompts
  let email = process.env.ADMIN_EMAIL;
  if (!email) email = await ask("Admin email: ");

  if (!email || !email.includes("@")) {
    console.error("❌ Invalid email");
    process.exit(1);
  }

  const exists = await adminExists(email);
  if (exists) {
    console.log("ℹ️ Admin already exists for:", email);
    process.exit(0);
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) password = await ask("Admin password: ");
  if (!password || password.length < 8) {
    console.error("❌ Password must be at least 8 characters");
    process.exit(1);
  }

  const userName = process.env.ADMIN_USERNAME || "Admin";

  await createAdmin({ email, password, userName });
  console.log("🎉 Done. You can now log in with:");
  console.log("   Email:", email);
  console.log("   Password:", password);
  process.exit(0);
})();

