const sql = require("mssql");
const config = require("../config/dbConfig");

let poolPromise;

async function initSQLConnection() {
  if (!poolPromise) {
    // Add connection timeout and retry options
    const connectionConfig = {
      ...config,
      connectionTimeout: 30000, // 30 seconds
      requestTimeout: 30000, // 30 seconds
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      },
      options: {
        ...config.options,
        enableArithAbort: true,
        connectTimeout: 30000, // 30 seconds
      }
    };

    // Log connection attempt (hide password)
    console.log(`🔌 Attempting to connect to SQL Server: ${config.server}:${config.port}`);
    console.log(`   Database: ${config.database}, User: ${config.user}`);

    poolPromise = sql.connect(connectionConfig)
      .then(pool => {
        console.log("✅ Connected to SQL Server successfully");
        return pool;
      })
      .catch(err => {
        console.error("❌ SQL Connection failed:", err.message || err);
        console.error(`   Server: ${config.server}:${config.port}`);
        console.error(`   Database: ${config.database}`);
        console.error("⚠️  Server will continue running, but SQL Server features may not work");
        console.error("💡 Check your environment variables: MSSQL_SERVER, MSSQL_USER, MSSQL_PASSWORD, MSSQL_DATABASE");
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