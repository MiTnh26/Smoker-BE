// models/entityAccountModel.js
const { getPool, sql } = require("../db/sqlserver");

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
    
    // Nếu chưa có EntityAccount, kiểm tra AccountId có tồn tại trong Accounts trước khi tạo
    console.log('⚠️ EntityAccount not found for AccountId:', accountId, '- Checking if Account exists...');
    
    // Kiểm tra AccountId có tồn tại trong bảng Accounts
    const accountCheck = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 AccountId 
        FROM Accounts 
        WHERE AccountId = @AccountId
      `);
    
    if (accountCheck.recordset.length === 0) {
      console.error('❌ AccountId does not exist in Accounts table:', accountId);
      console.error('❌ Cannot create EntityAccount - AccountId is invalid');
      return null;
    }
    
    console.log('✅ AccountId exists in Accounts table, creating EntityAccount...');
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
      if (createError.code === 'EREQUEST' && (
        createError.message?.includes('UNIQUE') || 
        createError.message?.includes('duplicate')
      )) {
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
      // Nếu lỗi FOREIGN KEY constraint, AccountId không tồn tại
      if (createError.message?.includes('FOREIGN KEY') || createError.message?.includes('FK__')) {
        console.error('❌ FOREIGN KEY constraint error - AccountId does not exist in Accounts:', accountId);
        return null;
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
    .query(`SELECT b.BarPageId AS id, b.BarName AS name, b.Avatar AS avatar, b.Role AS role, b.Status AS status, ea.EntityAccountId
            FROM BarPages b
            LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = b.BarPageId
            WHERE b.AccountId = @AccountId`);

  // 2. Lấy BusinessAccounts kèm EntityAccountId
  const businessAccountsResult = await pool.request()
    .input("AccountId", sql.UniqueIdentifier, accountId)
    .query(`SELECT ba.BussinessAccountId AS id, ba.UserName AS name, ba.Avatar AS avatar, ba.Role AS role, ba.Status AS status, ea.EntityAccountId
            FROM BussinessAccounts ba
            LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BusinessAccount' AND ea.EntityId = ba.BussinessAccountId
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
/**
 * Verify và lấy thông tin chi tiết của EntityAccountId
 * @param {string} entityAccountId - EntityAccountId cần verify
 * @returns {Promise<Object|null>} { EntityAccountId, EntityType, EntityId, AccountId } hoặc null nếu không tồn tại
 */
async function verifyEntityAccountId(entityAccountId) {
  try {
    if (!entityAccountId) {
      return null;
    }
    
    const pool = await getPool();
    const result = await pool.request()
      .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
      .query(`
        SELECT 
          EntityAccountId,
          EntityType,
          EntityId,
          AccountId,
          created_at
        FROM EntityAccounts 
        WHERE EntityAccountId = @EntityAccountId
      `);
    
    if (result.recordset.length > 0) {
      const record = result.recordset[0];
      return {
        EntityAccountId: String(record.EntityAccountId),
        EntityType: record.EntityType,
        EntityId: String(record.EntityId),
        AccountId: String(record.AccountId),
        created_at: record.created_at
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Error in verifyEntityAccountId:', error.message);
    return null;
  }
}

/**
 * Validate if a string is a valid UUID format
 * @param {string} str - String to validate
 * @returns {boolean} True if valid UUID format
 */
function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
  return uuidRegex.test(str.trim());
}

/**
 * Normalize any ID type to EntityAccountId
 * This is the single source of truth for ID normalization
 * Handles: EntityAccountId, EntityId, AccountId, BarPageId, BusinessAccountId
 * 
 * @param {string} id - Any type of ID (EntityAccountId, EntityId, AccountId, etc.)
 * @returns {Promise<string|null>} EntityAccountId or null if not found
 */
async function normalizeToEntityAccountId(id) {
  if (!id) return null;
  
  // Convert to string and trim
  const idStr = String(id).trim();
  if (!idStr) return null;
  
  // Validate UUID format before attempting SQL queries
  // This prevents SQL Server errors when trying to convert invalid formats
  if (!isValidUUID(idStr)) {
    console.warn('⚠️ normalizeToEntityAccountId - Invalid UUID format:', idStr);
    return null;
  }
  
  try {
    const pool = await getPool();
    
    // Strategy 1: Check if it's already an EntityAccountId (most common case)
    // This handles cases where frontend already sends EntityAccountId
    try {
      const asEntityAccountId = await pool.request()
        .input("EntityAccountId", sql.UniqueIdentifier, idStr)
        .query(`
          SELECT TOP 1 EntityAccountId 
          FROM EntityAccounts 
          WHERE EntityAccountId = @EntityAccountId
        `);
      
      if (asEntityAccountId.recordset.length > 0) {
        const result = asEntityAccountId.recordset[0].EntityAccountId;
        return result ? String(result) : null;
      }
    } catch (err) {
      // If conversion fails, ID is not a valid UUID format
      // Continue to next strategy - this is expected behavior
      console.warn('⚠️ normalizeToEntityAccountId - Strategy 1 failed:', err.message);
    }
    
    // Strategy 2: Check if it's an EntityId (for any EntityType: Account, BarPage, BusinessAccount)
    // This handles cases where frontend sends BarPageId, BusinessAccountId, etc.
    try {
      const asEntityId = await pool.request()
        .input("EntityId", sql.UniqueIdentifier, idStr)
        .query(`
          SELECT TOP 1 EntityAccountId 
          FROM EntityAccounts 
          WHERE EntityId = @EntityId
        `);
      
      if (asEntityId.recordset.length > 0) {
        const result = asEntityId.recordset[0].EntityAccountId;
        return result ? String(result) : null;
      }
    } catch (err) {
      // If conversion fails, continue to next strategy - this is expected behavior
      console.warn('⚠️ normalizeToEntityAccountId - Strategy 2 failed:', err.message);
    }
    
    // Strategy 3: Check if it's an AccountId (for Account type only)
    // This handles cases where frontend sends AccountId of a user
    try {
      const accountResult = await getEntityAccountIdByAccountId(idStr);
      if (accountResult) {
        return accountResult;
      }
    } catch (accountError) {
      // Ignore error, continue - this is expected behavior for non-Account IDs
      console.warn('⚠️ normalizeToEntityAccountId - Strategy 3 failed:', accountError.message);
    }
    
    // If none of the strategies work, return null
    return null;
  } catch (error) {
    console.error('❌ Error in normalizeToEntityAccountId:', error.message);
    return null;
  }
}

/**
 * Get all EntityAccountIds for a given AccountId
 * This is needed to support multi-role system where one AccountId can have multiple EntityAccountIds
 * Uses getEntitiesByAccountId and extracts EntityAccountIds
 * @param {string} accountId - AccountId from JWT token
 * @returns {Promise<string[]>} Array of EntityAccountIds (normalized to lowercase strings)
 */
async function getAllEntityAccountIdsForAccount(accountId) {
  try {
    if (!accountId) return [];
    const entities = await getEntitiesByAccountId(accountId);
    return entities
      .map(e => e.EntityAccountId)
      .filter(id => id != null)
      .map(id => String(id).toLowerCase().trim());
  } catch (err) {
    console.error("[entityAccountModel] Error getting all EntityAccountIds for Account:", err);
    return [];
  }
}

/**
 * Normalize and compare participants for message/conversation operations
 * Handles both ObjectId and string formats
 * @param {any} participant - Participant ID (can be ObjectId or string)
 * @returns {string} Normalized participant ID (lowercase trimmed string)
 */
function normalizeParticipant(participant) {
  if (!participant) return "";
  return String(participant).toLowerCase().trim();
}

module.exports = {
  getEntitiesByAccountId,
  createEntityAccount,
  getEntityAccountIdByAccountId,
  verifyEntityAccountId,
  normalizeToEntityAccountId,
  getAllEntityAccountIdsForAccount,
  normalizeParticipant
};
