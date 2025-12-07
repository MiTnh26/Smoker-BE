const bankInfoModel = require("../models/bankInfoModel");
const { success, error } = require("../utils/response");

// Helper function để parse error từ SQL Server
function parseSqlError(err) {
  // SQL Server unique constraint violation error number
  const UNIQUE_CONSTRAINT_ERROR = 2627;
  // SQL Server duplicate key error
  const DUPLICATE_KEY_ERROR = 2601;
  
  return {
    isUniqueViolation: err.number === UNIQUE_CONSTRAINT_ERROR || err.number === DUPLICATE_KEY_ERROR,
    errorNumber: err.number,
    message: err.message,
    originalError: err.originalError
  };
}

// ➕ Tạo BankInfo mới
exports.createBankInfo = async (req, res) => {
  // Lưu accountId và barPageId vào biến để dùng trong catch block
  let accountId, barPageId;
  
  try {
    const { bankName, accountNumber, accountId, barPageId } = req.body;

    // Validation
    if (!bankName || !accountNumber) {
      return res.status(400).json(error("Thiếu thông tin bắt buộc: BankName và AccountNumber"));
    }

    if (!accountId && !barPageId) {
      return res.status(400).json(error("Phải có accountId hoặc barPageId"));
    }

    if (accountId && barPageId) {
      return res.status(400).json(error("Chỉ được có accountId hoặc barPageId, không được có cả hai"));
    }

    // Validate accountNumber: chỉ chứa số
    if (!/^\d+$/.test(accountNumber)) {
      return res.status(400).json(error("Số tài khoản chỉ được chứa số"));
    }

    // Xóa các record NULL (orphan records) trước khi check và insert
    // Điều này quan trọng để tránh unique constraint violation với NULL
    try {
      const deletedCount = await bankInfoModel.deleteNullRecords();
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} NULL records from BankInfo`);
      } else {
        console.log("🧹 No NULL records to clean up");
      }
    } catch (cleanupError) {
      console.warn("⚠️ Warning: Error cleaning up NULL records:", cleanupError.message);
      // Không block, tiếp tục - nhưng có thể sẽ bị unique constraint violation sau đó
    }

    // Validate UUID format cho accountId
    if (accountId) {
      const accountIdToCheck = accountId.toString().trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(accountIdToCheck)) {
        console.error("❌ [Controller] Invalid UUID format for accountId:", accountIdToCheck);
        return res.status(400).json(error("AccountId không hợp lệ"));
      }
    }

    // Tạm thời BỎ QUA check existing cho accountId vì có thể bị false positive
    // Để database xử lý unique constraint violation và catch error trong catch block
    // Chỉ check cho barPageId vì nó hoạt động đúng
    if (barPageId) {
      try {
        const barPageIdToCheck = barPageId.toString().trim();
        console.log("🔍 Checking existing bank info for barPageId:", barPageIdToCheck);
        const existing = await bankInfoModel.getBankInfoByBarPageId(barPageIdToCheck);
        console.log("🔍 Check result:", existing ? "Found existing" : "Not found");
        if (existing) {
          console.log("⚠️ BankInfo already exists for barPageId:", barPageIdToCheck);
          return res.status(400).json({
            status: "error",
            message: "Bar page này đã có thông tin ngân hàng. Vui lòng sử dụng chức năng cập nhật.",
            error: "Bar page này đã có thông tin ngân hàng",
            existingBankInfo: existing
          });
        }
        console.log("✅ No existing bank info found, proceeding with create");
      } catch (checkError) {
        console.warn("⚠️ Warning: Error checking existing bank info:", checkError.message);
      }
    }

    if (barPageId) {
      try {
        const barPageIdToCheck = barPageId.toString().trim();
        console.log("🔍 Checking existing bank info for barPageId:", barPageIdToCheck);
        const existing = await bankInfoModel.getBankInfoByBarPageId(barPageIdToCheck);
        console.log("🔍 Check result:", existing ? "Found existing" : "Not found");
        if (existing) {
          console.log("⚠️ BankInfo already exists for barPageId:", barPageIdToCheck);
          return res.status(400).json({
            status: "error",
            message: "Bar page này đã có thông tin ngân hàng. Vui lòng sử dụng chức năng cập nhật.",
            error: "Bar page này đã có thông tin ngân hàng",
            existingBankInfo: existing
          });
        }
        console.log("✅ No existing bank info found, proceeding with create");
      } catch (checkError) {
        console.warn("⚠️ Warning: Error checking existing bank info:", checkError.message);
      }
    }

    // Không normalize IDs vì SQL Server UniqueIdentifier tự động handle
    // Chỉ trim để đảm bảo không có whitespace
    const accountIdToSave = accountId ? accountId.toString().trim() : null;
    const barPageIdToSave = barPageId ? barPageId.toString().trim() : null;
    
    console.log("💾 Creating bank info with:", {
      accountId: accountIdToSave,
      barPageId: barPageIdToSave,
      bankName,
      accountNumber: accountNumber.substring(0, 4) + "***" // Chỉ log một phần để bảo mật
    });
    
    const bankInfo = await bankInfoModel.createBankInfo({
      bankName,
      accountNumber,
      accountId: accountIdToSave,
      barPageId: barPageIdToSave,
    });
    
    console.log("✅ Bank info created successfully:", {
      BankInfoId: bankInfo?.BankInfoId,
      AccountId: bankInfo?.AccountId,
      BarPageId: bankInfo?.BarPageId
    });

    return res.status(201).json(success("Tạo thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("❌ createBankInfo error:", err);
    const parsedError = parseSqlError(err);
    console.error("Error details:", parsedError);
    
    // Lấy accountId, barPageId, bankName, accountNumber từ req.body vì có thể không có trong scope
    const { 
      accountId: errorAccountId, 
      barPageId: errorBarPageId,
      bankName: errorBankName,
      accountNumber: errorAccountNumber
    } = req.body || {};
    
    // Handle unique constraint violation (SQL Server error 2627 hoặc 2601)
    if (parsedError.isUniqueViolation || err.message?.includes("UNIQUE") || err.message?.includes("duplicate") || err.message?.includes("violation")) {
      console.log("⚠️ Unique constraint violation detected");
      console.log("Error message:", err.message);
      console.log("Error number:", err.number);
      console.log("AccountId:", errorAccountId);
      console.log("BarPageId:", errorBarPageId);
      
      // Kiểm tra xem có phải do NULL constraint không
      const isNullConstraint = err.message?.includes("(<NULL>)");
      if (isNullConstraint) {
        console.log("⚠️ NULL constraint violation detected - cleaning up NULL records...");
        // Thử tìm record với NULL AccountId/BarPageId và xóa nó
        try {
          const deletedCount = await bankInfoModel.deleteNullRecords();
          console.log(`✅ Deleted ${deletedCount} NULL records, retrying create...`);
          
          // Retry create với accountId/barPageId đã được trim
          const accountIdToRetry = errorAccountId ? errorAccountId.toString().trim() : null;
          const barPageIdToRetry = errorBarPageId ? errorBarPageId.toString().trim() : null;
          
          console.log("🔄 Retrying create with:", { accountId: accountIdToRetry, barPageId: barPageIdToRetry });
          
          const bankInfo = await bankInfoModel.createBankInfo({
            bankName: errorBankName,
            accountNumber: errorAccountNumber,
            accountId: accountIdToRetry,
            barPageId: barPageIdToRetry,
          });
          console.log("✅ Bank info created successfully after deleting NULL records");
          return res.status(201).json(success("Tạo thông tin ngân hàng thành công", bankInfo));
        } catch (retryError) {
          console.error("❌ Retry failed:", retryError.message);
          console.error("Retry error number:", retryError.number);
          // Nếu retry vẫn fail, có thể là do đã có record thực sự, fall through to fetch existing
        }
      }
      
      // Thử fetch lại bank info để trả về cho frontend
      // Lưu ý: Chỉ fetch cho barPageId vì getBankInfoByAccountId có thể bị false positive
      let existingBankInfo = null;
      try {
        const accountIdToFetch = errorAccountId ? errorAccountId.toString().trim() : null;
        const barPageIdToFetch = errorBarPageId ? errorBarPageId.toString().trim() : null;
        
        if (barPageIdToFetch) {
          // BarPageId hoạt động đúng, fetch bình thường
          console.log("🔍 Fetching existing bank info for barPageId:", barPageIdToFetch);
          existingBankInfo = await bankInfoModel.getBankInfoByBarPageId(barPageIdToFetch);
          console.log("🔍 Fetch result:", existingBankInfo ? "Found" : "Not found");
        } else if (accountIdToFetch) {
          // AccountId có thể bị false positive, query trực tiếp với điều kiện chặt chẽ hơn
          console.log("🔍 Fetching existing bank info for accountId (direct query):", accountIdToFetch);
          const pool = await require("../db/sqlserver").getPool();
          const sql = require("../db/sqlserver").sql;
          const result = await pool.request()
            .input("AccountId", sql.UniqueIdentifier, accountIdToFetch)
            .query(`
              SELECT TOP 1 BankInfoId, BankName, AccountNumber, AccountId, BarPageId
              FROM BankInfo
              WHERE AccountId = @AccountId
                AND AccountId IS NOT NULL
                AND LOWER(CAST(AccountId AS VARCHAR(36))) = LOWER(CAST(@AccountId AS VARCHAR(36)))
            `);
          
          if (result.recordset.length > 0) {
            const found = result.recordset[0];
            // Double check: đảm bảo AccountId thực sự match
            const foundAccountId = found.AccountId ? found.AccountId.toString().toLowerCase().trim() : null;
            const searchAccountId = accountIdToFetch.toLowerCase().trim();
            
            if (foundAccountId && foundAccountId === searchAccountId) {
              existingBankInfo = found;
              console.log("✅ Found existing bank info with matching AccountId");
            } else {
              console.warn("⚠️ Found record but AccountId doesn't match, ignoring");
            }
          } else {
            console.log("🔍 No existing bank info found in direct query");
          }
        } else {
          // Nếu cả hai đều null, có thể là do NULL constraint
          console.log("⚠️ Both accountId and barPageId are null, checking for NULL records...");
          existingBankInfo = await bankInfoModel.getBankInfoByNullIds();
        }
      } catch (fetchError) {
        console.warn("⚠️ Could not fetch existing bank info:", fetchError.message);
      }
      
      if (existingBankInfo && existingBankInfo.BankInfoId) {
        console.log("✅ Returning existing bank info to frontend for update");
        return res.status(400).json({
          status: "error",
          message: "Tài khoản này đã có thông tin ngân hàng. Vui lòng sử dụng chức năng cập nhật.",
          error: "Tài khoản này đã có thông tin ngân hàng",
          existingBankInfo: existingBankInfo
        });
      } else {
        // Nếu không fetch được existing hoặc không có BankInfoId hợp lệ
        // Có thể là do NULL constraint violation hoặc unique constraint khác
        console.warn("⚠️ Unique constraint violation but no valid existing bank info found");
        console.warn("⚠️ This might be due to NULL constraint or other unique constraint");
        
        // Thử xóa NULL records một lần nữa và retry
        if (errorAccountId || errorBarPageId) {
          try {
            console.log("🔄 Attempting to clean up NULL records and retry one more time...");
            const deletedCount = await bankInfoModel.deleteNullRecords();
            console.log(`✅ Deleted ${deletedCount} NULL records`);
            
            // Retry create
            const accountIdToRetry = errorAccountId ? errorAccountId.toString().trim() : null;
            const barPageIdToRetry = errorBarPageId ? errorBarPageId.toString().trim() : null;
            
            const bankInfo = await bankInfoModel.createBankInfo({
              bankName: errorBankName,
              accountNumber: errorAccountNumber,
              accountId: accountIdToRetry,
              barPageId: barPageIdToRetry,
            });
            console.log("✅ Bank info created successfully after final retry");
            return res.status(201).json(success("Tạo thông tin ngân hàng thành công", bankInfo));
          } catch (finalRetryError) {
            console.error("❌ Final retry also failed:", finalRetryError.message);
            return res.status(400).json({
              status: "error",
              message: "Không thể tạo thông tin ngân hàng. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
              error: "Unique constraint violation - unable to create after cleanup"
            });
          }
        } else {
          return res.status(400).json({
            status: "error",
            message: "Không thể tạo thông tin ngân hàng. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
            error: "Unique constraint violation"
          });
        }
      }
    }
    
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

// 📖 Lấy BankInfo theo ID
exports.getBankInfoById = async (req, res) => {
  try {
    const { bankInfoId } = req.params;
    const bankInfo = await bankInfoModel.getBankInfoById(bankInfoId);
    
    if (!bankInfo) {
      return res.status(404).json(error("Không tìm thấy thông tin ngân hàng"));
    }

    return res.json(success("Lấy thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("getBankInfoById error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

// 📖 Lấy BankInfo theo AccountId
exports.getBankInfoByAccountId = async (req, res) => {
  try {
    console.log("🔍 getBankInfoByAccountId controller - START");
    const { accountId } = req.params;
    console.log("🔍 accountId:", accountId);
    const bankInfo = await bankInfoModel.getBankInfoByAccountId(accountId);
    console.log("🔍 bankInfo result:", bankInfo);
    
    if (!bankInfo) {
      console.log("🔍 No bankInfo found, returning 404");
      return res.status(404).json(error("Không tìm thấy thông tin ngân hàng"));
    }

    console.log("🔍 Returning success");
    return res.json(success("Lấy thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("getBankInfoByAccountId error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

// 📖 Lấy BankInfo theo BarPageId
exports.getBankInfoByBarPageId = async (req, res) => {
  try {
    const { barPageId } = req.params;
    const bankInfo = await bankInfoModel.getBankInfoByBarPageId(barPageId);
    
    if (!bankInfo) {
      return res.status(404).json(error("Không tìm thấy thông tin ngân hàng"));
    }

    return res.json(success("Lấy thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("getBankInfoByBarPageId error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

// ✏️ Cập nhật BankInfo
exports.updateBankInfo = async (req, res) => {
  try {
    const { bankInfoId } = req.params;
    const { bankName, accountNumber } = req.body;

    if (!bankName && !accountNumber) {
      return res.status(400).json(error("Phải có ít nhất một trường để cập nhật"));
    }

    // Validate accountNumber nếu có
    if (accountNumber && !/^\d+$/.test(accountNumber)) {
      return res.status(400).json(error("Số tài khoản chỉ được chứa số"));
    }

    const updated = await bankInfoModel.updateBankInfo(bankInfoId, { bankName, accountNumber });

    if (!updated) {
      return res.status(404).json(error("Không tìm thấy thông tin ngân hàng"));
    }

    return res.json(success("Cập nhật thông tin ngân hàng thành công", updated));
  } catch (err) {
    console.error("updateBankInfo error:", err);
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

// 🗑️ Xóa BankInfo
exports.deleteBankInfo = async (req, res) => {
  try {
    const { bankInfoId } = req.params;
    const deleted = await bankInfoModel.deleteBankInfo(bankInfoId);

    if (!deleted) {
      return res.status(404).json(error("Không tìm thấy thông tin ngân hàng"));
    }

    return res.json(success("Xóa thông tin ngân hàng thành công"));
  } catch (err) {
    console.error("deleteBankInfo error:", err);
    
    // Handle foreign key constraint violation
    if (err.number === 547 || err.message.includes("FOREIGN KEY")) {
      return res.status(400).json(error("Không thể xóa vì đang được sử dụng bởi tài khoản khác"));
    }
    
    return res.status(500).json(error(err.message || "Lỗi máy chủ"));
  }
};

