const bcrypt = require("bcryptjs");
const { getPool, sql } = require("../db/sqlserver");

/**
 * Check if admin exists with given email
 */
async function adminExists(email) {
  try {
    const pool = await getPool();
    const res = await pool.request()
      .input("Email", sql.NVarChar(100), email)
      .query("SELECT TOP 1 AccountId FROM Accounts WHERE Email = @Email AND Role = 'Admin'");
    return res.recordset.length > 0;
  } catch (error) {
    console.error("❌ Error checking admin existence:", error.message);
    return false;
  }
}

/**
 * Create an admin account
 */
async function createAdmin({ email, password, userName = "Admin" }) {
  try {
    const pool = await getPool();

    // Check duplicate email
    const dup = await pool.request()
      .input("Email", sql.NVarChar(100), email)
      .query("SELECT TOP 1 AccountId, Role FROM Accounts WHERE Email = @Email");
    
    if (dup.recordset.length) {
      const existingRole = dup.recordset[0].Role;
      if (String(existingRole).toLowerCase() === "admin") {
        console.log("ℹ️  Admin already exists with this email. Nothing to do.");
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
  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
    throw error;
  }
}

/**
 * Initialize admin account on server startup
 * Reads from environment variables: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME
 */
async function initializeAdmin() {
  try {
    // Wait a bit for SQL connection to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const userName = process.env.ADMIN_USERNAME || "Admin";

    // Skip if no admin credentials provided
    if (!email || !password) {
      console.log("ℹ️  ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping admin initialization.");
      return;
    }

    // Validate email
    if (!email.includes("@")) {
      console.error("❌ Invalid ADMIN_EMAIL format. Skipping admin initialization.");
      return;
    }

    // Validate password
    if (password.length < 8) {
      console.error("❌ ADMIN_PASSWORD must be at least 8 characters. Skipping admin initialization.");
      return;
    }

    // Check if admin already exists
    const exists = await adminExists(email);
    if (exists) {
      console.log("ℹ️  Admin already exists for:", email);
      return;
    }

    // Create admin
    await createAdmin({ email, password, userName });
    console.log("🎉 Admin initialization completed.");
    console.log("   Email:", email);
    console.log("   Username:", userName);
  } catch (error) {
    // Don't block server startup if admin creation fails
    console.error("⚠️  Failed to initialize admin account:", error.message);
    console.error("   Server will continue running. You can create admin manually later.");
  }
}

module.exports = {
  adminExists,
  createAdmin,
  initializeAdmin,
};

