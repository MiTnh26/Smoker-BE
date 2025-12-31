/**
 * Migration Script: Convert BankInfo từ AccountId/BarPageId sang EntityAccountId
 * 
 * Script này sẽ:
 * 1. Query tất cả BankInfo có AccountId hoặc BarPageId
 * 2. Tìm EntityAccountId tương ứng
 * 3. Update BankInfo với EntityAccountId mới
 * 4. Xóa các record không có EntityAccountId hợp lệ
 */

const { getPool, sql } = require("../db/sqlserver");
const { normalizeToEntityAccountId } = require("../models/entityAccountModel");

async function migrateBankInfo() {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    console.log("🚀 Bắt đầu migration BankInfo...");
    
    // 1. Query tất cả BankInfo có AccountId hoặc BarPageId (cũ)
    const oldBankInfos = await transaction.request()
      .query(`
        SELECT BankInfoId, BankName, AccountNumber, AccountId, BarPageId
        FROM BankInfo
        WHERE AccountId IS NOT NULL OR BarPageId IS NOT NULL
      `);
    
    console.log(`📊 Tìm thấy ${oldBankInfos.recordset.length} BankInfo cần migrate`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // 2. Convert từng BankInfo
    for (const bankInfo of oldBankInfos.recordset) {
      try {
        const accountId = bankInfo.AccountId;
        const barPageId = bankInfo.BarPageId;
        const bankInfoId = bankInfo.BankInfoId;
        
        // Tìm EntityAccountId tương ứng
        let entityAccountId = null;
        
        if (accountId) {
          entityAccountId = await normalizeToEntityAccountId(accountId);
        } else if (barPageId) {
          entityAccountId = await normalizeToEntityAccountId(barPageId);
        }
        
        if (!entityAccountId) {
          console.warn(`⚠️ Không tìm thấy EntityAccountId cho BankInfo ${bankInfoId} (AccountId: ${accountId}, BarPageId: ${barPageId})`);
          errors.push({
            bankInfoId,
            reason: "Không tìm thấy EntityAccountId",
            accountId,
            barPageId
          });
          errorCount++;
          continue;
        }
        
        // Kiểm tra xem EntityAccountId này đã có BankInfo chưa
        const existing = await transaction.request()
          .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
          .query(`
            SELECT BankInfoId
            FROM BankInfo
            WHERE EntityAccountId = @EntityAccountId
          `);
        
        if (existing.recordset.length > 0) {
          console.warn(`⚠️ EntityAccountId ${entityAccountId} đã có BankInfo. Bỏ qua BankInfo ${bankInfoId}`);
          errors.push({
            bankInfoId,
            reason: "EntityAccountId đã có BankInfo",
            entityAccountId
          });
          errorCount++;
          continue;
        }
        
        // 3. Update BankInfo với EntityAccountId mới
        await transaction.request()
          .input("BankInfoId", sql.UniqueIdentifier, bankInfoId)
          .input("EntityAccountId", sql.UniqueIdentifier, entityAccountId)
          .query(`
            UPDATE BankInfo
            SET EntityAccountId = @EntityAccountId,
                AccountId = NULL,
                BarPageId = NULL
            WHERE BankInfoId = @BankInfoId
          `);
        
        console.log(`✅ Migrated BankInfo ${bankInfoId} → EntityAccountId ${entityAccountId}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Lỗi khi migrate BankInfo ${bankInfo.BankInfoId}:`, err.message);
        errors.push({
          bankInfoId: bankInfo.BankInfoId,
          reason: err.message
        });
        errorCount++;
      }
    }
    
    // 4. Xóa các record không có EntityAccountId hợp lệ (orphan records)
    const deleteResult = await transaction.request()
      .query(`
        DELETE FROM BankInfo
        WHERE EntityAccountId IS NULL
          AND (AccountId IS NULL AND BarPageId IS NULL)
      `);
    
    const deletedCount = deleteResult.rowsAffected[0] || 0;
    console.log(`🗑️ Đã xóa ${deletedCount} orphan records`);
    
    await transaction.commit();
    
    console.log("\n📊 Kết quả migration:");
    console.log(`✅ Thành công: ${successCount}`);
    console.log(`❌ Lỗi: ${errorCount}`);
    console.log(`🗑️ Đã xóa: ${deletedCount} orphan records`);
    
    if (errors.length > 0) {
      console.log("\n⚠️ Chi tiết lỗi:");
      errors.forEach((err, index) => {
        console.log(`${index + 1}. BankInfoId: ${err.bankInfoId}, Lý do: ${err.reason}`);
      });
    }
    
    return {
      success: true,
      successCount,
      errorCount,
      deletedCount,
      errors
    };
  } catch (err) {
    await transaction.rollback();
    console.error("❌ Migration failed:", err);
    throw err;
  }
}

// Chạy migration nếu file được gọi trực tiếp
if (require.main === module) {
  migrateBankInfo()
    .then((result) => {
      console.log("\n✅ Migration hoàn tất!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Migration thất bại:", err);
      process.exit(1);
    });
}

module.exports = { migrateBankInfo };

