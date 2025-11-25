// src/models/entityAccountModel.js
const { getPool, sql } = require("../db/sqlserver");

// Lấy EntityAccountId từ AccountId + EntityType (mặc định là 'Account')
async function getEntityAccountIdByAccountId(accountId, entityType = "Account") {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .input("EntityType", sql.NVarChar(50), entityType)
    .query(`
      SELECT TOP 1 EntityAccountId
      FROM EntityAccounts
      WHERE AccountId = @AccountId AND EntityType = @EntityType
    `);

  return result.recordset[0]?.EntityAccountId || null;
}

module.exports = {
  getEntityAccountIdByAccountId,
};
