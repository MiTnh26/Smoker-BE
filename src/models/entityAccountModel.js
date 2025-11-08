/**
 * Lấy EntityAccountId từ AccountId (chính chủ user)
 * Query theo AccountId (chủ sở hữu) thay vì EntityId để tìm EntityAccountId đúng
 * @param {string} accountId
 * @returns {string|null} EntityAccountId hoặc null nếu không tìm thấy
 */
async function getEntityAccountIdByAccountId(accountId) {
  try {
    console.log('🔍 getEntityAccountIdByAccountId - Input AccountId:', accountId, '| Type:', typeof accountId);
    const pool = await getPool();
    // Query theo AccountId (chủ sở hữu) và EntityType='Account', EntityId=AccountId
    // Để tìm EntityAccountId của Account chính
    const result = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 EntityAccountId 
        FROM EntityAccounts 
        WHERE EntityType = 'Account' 
          AND EntityId = @AccountId
          AND AccountId = @AccountId
      `);
    
    console.log('📊 Query result - Records found:', result.recordset.length);
    
    if (result.recordset.length > 0) {
      const entityAccountId = result.recordset[0].EntityAccountId;
      const entityAccountIdStr = entityAccountId ? String(entityAccountId) : null;
      console.log('✅ Found EntityAccountId:', entityAccountIdStr, '| Raw type:', typeof entityAccountId);
      // Convert to string if it's a UniqueIdentifier object
      return entityAccountIdStr;
    }
    
    // Nếu chưa có EntityAccount, tự động tạo (fallback)
    console.log('⚠️ EntityAccount not found for AccountId:', accountId, '- Creating new one...');
    try {
      await createEntityAccount("Account", accountId, accountId);
      console.log('✅ Created EntityAccount for AccountId:', accountId);
      
      // Lấy lại EntityAccountId vừa tạo
      const result2 = await pool.request()
        .input("AccountId", sql.UniqueIdentifier, accountId)
        .query(`
          SELECT TOP 1 EntityAccountId 
          FROM EntityAccounts 
          WHERE EntityType = 'Account' 
            AND EntityId = @AccountId
            AND AccountId = @AccountId
        `);
      
      if (result2.recordset.length > 0) {
        const entityAccountId = result2.recordset[0].EntityAccountId;
        const entityAccountIdStr = entityAccountId ? String(entityAccountId) : null;
        console.log('✅ Retrieved new EntityAccountId:', entityAccountIdStr);
        return entityAccountIdStr;
      }
      console.error('❌ Failed to retrieve newly created EntityAccountId');
    } catch (createError) {
      // Nếu đã tồn tại (UNIQUE constraint) thì query lại
      if (createError.code === 'EREQUEST' || createError.message?.includes('UNIQUE')) {
        console.log('⚠️ EntityAccount already exists, querying again...');
        const result3 = await pool.request()
          .input("AccountId", sql.UniqueIdentifier, accountId)
          .query(`
            SELECT TOP 1 EntityAccountId 
            FROM EntityAccounts 
            WHERE EntityType = 'Account' 
              AND EntityId = @AccountId
              AND AccountId = @AccountId
          `);
        
        if (result3.recordset.length > 0) {
          const entityAccountId = result3.recordset[0].EntityAccountId;
          const entityAccountIdStr = entityAccountId ? String(entityAccountId) : null;
          console.log('✅ Retrieved existing EntityAccountId:', entityAccountIdStr);
          return entityAccountIdStr;
        }
      }
      console.error('❌ Error creating EntityAccount:', createError.message);
    }
    
    console.error('❌ getEntityAccountIdByAccountId - Returning null');
    return null;
  } catch (error) {
    console.error('❌ Error in getEntityAccountIdByAccountId:', error.message);
    console.error('Stack:', error.stack);
    return null;
  }
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
  try {
    const pool = await getPool();
    await pool.request()
      .input("EntityType", sql.NVarChar(50), entityType)
      .input("EntityId", sql.UniqueIdentifier, entityId)
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        INSERT INTO EntityAccounts (EntityType, EntityId, AccountId)
        VALUES (@EntityType, @EntityId, @AccountId)
      `);
    console.log('Created EntityAccount:', { entityType, entityId, accountId });
  } catch (error) {
    // Nếu đã tồn tại (UNIQUE constraint) thì bỏ qua
    if (error.code === 'EREQUEST' && error.message && error.message.includes('UNIQUE')) {
      console.log('EntityAccount already exists:', { entityType, entityId });
      return;
    }
    throw error;
  }
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
