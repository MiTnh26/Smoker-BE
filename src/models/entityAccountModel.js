// models/entityAccountModel.js
const { getPool, sql } = require("../db/sqlserver");

/**
 * Tạo bản ghi EntityAccount mới
 * @param {string} entityType - Loại entity: "Account" | "BarPage" | "BusinessAccount"
 * @param {string} entityId - ID của entity mới tạo
 * @param {string} accountId - ID của chủ sở hữu (AccountId của user)
 */
async function createEntityAccount(entityType, entityId, accountId) {
  const pool = await getPool();
  await pool.request()
    .input("EntityType", sql.NVarChar(50), entityType)
    .input("EntityId", sql.UniqueIdentifier, entityId)
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`
      INSERT INTO EntityAccounts (EntityType, EntityId, AccountId)
      VALUES (@EntityType, @EntityId, @AccountId)
    `);
}
async function getEntitiesByAccountId(accountId) {
  const pool = await getPool();

  // 1. Lấy BarPages
  const barPagesResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT BarPageId AS id, BarName AS name, Avatar AS avatar, Role AS role
            FROM BarPages WHERE AccountId = @AccountId`);

  // 2. Lấy BusinessAccounts
  const businessAccountsResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT BussinessAccountId AS id, UserName AS name, Avatar AS avatar, Role AS role
            FROM BussinessAccounts WHERE AccountId = @AccountId`);

  // 3. Tự thêm Account chính
  const accountResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT AccountId AS id, UserName AS name, Avatar AS avatar, Role AS role
            FROM Accounts WHERE AccountId = @AccountId`);

  return [
    { type: "Account", ...accountResult.recordset[0] },
    ...barPagesResult.recordset.map(r => ({ type: "BarPage", ...r })),
    ...businessAccountsResult.recordset.map(r => ({ type: "BusinessAccount", ...r }))
  ];
}
module.exports = {getEntitiesByAccountId , createEntityAccount };
