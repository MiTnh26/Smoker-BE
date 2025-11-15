const sql = require("mssql");
const config = require("../config/dbConfig");

let poolPromise;

async function initSQLConnection() {
  if (!poolPromise) {
    poolPromise = sql.connect(config)
      .then(pool => {
        console.log("✅ Connected to SQL Server");
        return pool;
      })
      .catch(err => {
        console.error("❌ SQL Connection failed:", err.message || err);
        console.error("⚠️  Server will continue running, but SQL Server features may not work");
        // Don't throw error, just return null so server can continue
        return null;
      });
  }
  return poolPromise;
}

async function getPool() {
  if (!poolPromise) await initSQLConnection();
  const pool = await poolPromise;
  if (!pool) {
    throw new Error("SQL Server connection is not available. Please check your database configuration.");
  }
  return pool;
}

module.exports = { sql, initSQLConnection, getPool };