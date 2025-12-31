/*
 * CLI: Create an Admin account
 * Usage:
 *  node src/scripts/createAdmin.js            # interactive prompts
 *  ADMIN_EMAIL=admin@smoker.com ADMIN_PASSWORD=Admin123 node src/scripts/createAdmin.js  # env-based
 */
const readline = require("readline");
require("dotenv").config();
const { getPool } = require("../db/sqlserver");
const { adminExists, createAdmin } = require("../utils/adminSetup");
const { managerExists } = require("../models/managerModel");

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

(async function main() {
  await ensureConnection();

  // Prefer env, fall back to prompts
  let email = process.env.ADMIN_EMAIL;
  if (!email) email = await ask("Admin email: ");

  if (!email || !email.includes("@")) {
    console.error("❌ Invalid email");
    process.exit(1);
  }

  const exists = await managerExists(email);
  if (exists) {
    console.log("ℹ️ Manager already exists for:", email);
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

