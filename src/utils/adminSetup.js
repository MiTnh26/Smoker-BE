const { getManagerByEmail, createManager, managerExists } = require("../models/managerModel");

/**
 * Check if admin exists with given email
 */
async function adminExists(email) {
  try {
    return await managerExists(email);
  } catch (error) {
    console.error("❌ Error checking admin existence:", error.message);
    return false;
  }
}

/**
 * Create an admin account (tạo vào bảng Managers)
 */
async function createAdmin({ email, password, userName = "Admin", phone = null }) {
  try {
    // Check duplicate email
    const exists = await managerExists(email);
    if (exists) {
      console.log("ℹ️  Manager already exists with this email. Nothing to do.");
      return null;
    }

    const created = await createManager({
      email,
      password,
      role: "Admin", // Có thể là "Admin" hoặc "Accountant"
      phone
    });

    console.log("✅ Manager created:", created.Email, "| role:", created.Role);
    return created;
  } catch (error) {
    console.error("❌ Error creating manager:", error.message);
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

