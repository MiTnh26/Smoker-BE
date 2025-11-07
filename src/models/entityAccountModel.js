/**
 * Lấy EntityAccountId từ AccountId (chính chủ user)
 * @param {string} accountId
 * @returns {string|null} EntityAccountId hoặc null nếu không tìm thấy
 */
async function getEntityAccountIdByAccountId(accountId) {
  const pool = await getPool();
  const result = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query("SELECT TOP 1 EntityAccountId FROM EntityAccounts WHERE EntityType = 'Account' AND EntityId = @AccountId");
  if (result.recordset.length > 0) return result.recordset[0].EntityAccountId;
  return null;
}
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

  // 1. Lấy BarPages kèm EntityAccountId
  const barPagesResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT b.BarPageId AS id, b.BarName AS name, b.Avatar AS avatar, b.Role AS role, ea.EntityAccountId
            FROM BarPages b
            JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = b.BarPageId
            WHERE b.AccountId = @AccountId`);

  // 2. Lấy BusinessAccounts kèm EntityAccountId
  const businessAccountsResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT ba.BussinessAccountId AS id, ba.UserName AS name, ba.Avatar AS avatar, ba.Role AS role, ea.EntityAccountId
            FROM BussinessAccounts ba
            JOIN EntityAccounts ea ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
            WHERE ba.AccountId = @AccountId`);

  // 3. Lấy Account chính kèm EntityAccountId
  const accountResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT a.AccountId AS id, a.UserName AS name, a.Avatar AS avatar, a.Role AS role, ea.EntityAccountId
            FROM Accounts a
            JOIN EntityAccounts ea ON ea.EntityType = 'Account' AND ea.EntityId = a.AccountId
            WHERE a.AccountId = @AccountId`);

  return [
    { type: "Account", ...accountResult.recordset[0] },
    ...barPagesResult.recordset.map(r => ({ type: "BarPage", ...r })),
    ...businessAccountsResult.recordset.map(r => ({ type: "BusinessAccount", ...r }))
  ];
}
module.exports = {getEntitiesByAccountId , createEntityAccount, getEntityAccountIdByAccountId };
