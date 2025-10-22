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
        console.error("❌ SQL Connection failed:", err);
        throw err;
      });
  }
  return poolPromise;
}

async function getPool() {
  if (!poolPromise) await initSQLConnection();
  return poolPromise;
}

module.exports = { sql, initSQLConnection, getPool };
