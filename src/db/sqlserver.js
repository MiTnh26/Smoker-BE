const sql = require("mssql");
require("dotenv").config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let poolPromise;

async function getPool() {
  if (!poolPromise) {
    try {
      const pool = new sql.ConnectionPool(config);
      poolPromise = pool.connect();
      await poolPromise;
      console.log("✅ SQL Server connected");
    } catch (err) {
      console.error("❌ Database Connection Failed:", err);
      throw err;
    }
  }
  return poolPromise;
}

module.exports = { sql, getPool };
