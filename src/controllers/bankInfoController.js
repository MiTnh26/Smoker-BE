const bankInfoModel = require("../models/bankInfoModel");
const { normalizeToEntityAccountId } = require("../models/entityAccountModel");
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
  try {
    const { bankName, accountNumber, accountHolderName, entityAccountId, accountId, barPageId } = req.body;

    // Validation
    if (!bankName || !accountNumber || !accountHolderName) {
      return res.status(400).json(error("Thiếu thông tin bắt buộc: BankName, AccountNumber và AccountHolderName"));
    }

    // Nếu có entityAccountId thì dùng trực tiếp, nếu không thì convert từ accountId/barPageId
    let finalEntityAccountId = entityAccountId;
    
    if (!finalEntityAccountId) {
      // Backward compatibility: convert AccountId/BarPageId → EntityAccountId
      if (!accountId && !barPageId) {
        return res.status(400).json(error("Phải có entityAccountId hoặc (accountId hoặc barPageId)"));
      }

      if (accountId && barPageId) {
        return res.status(400).json(error("Chỉ được có accountId hoặc barPageId, không được có cả hai"));
      }

      // Convert AccountId hoặc BarPageId → EntityAccountId
      const idToConvert = accountId || barPageId;
      finalEntityAccountId = await normalizeToEntityAccountId(idToConvert);
      
      if (!finalEntityAccountId) {
        return res.status(400).json(error("Không tìm thấy EntityAccount tương ứng"));
      }
    }

    // Validate accountNumber: chỉ chứa số
    if (!/^\d+$/.test(accountNumber)) {
      return res.status(400).json(error("Số tài khoản chỉ được chứa số"));
    }

    // Validate UUID format cho entityAccountId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const entityAccountIdStr = finalEntityAccountId.toString().trim();
    if (!uuidRegex.test(entityAccountIdStr)) {
      return res.status(400).json(error("EntityAccountId không hợp lệ"));
    }

    // Check existing BankInfo cho EntityAccountId (UNIQUE constraint)
    const existing = await bankInfoModel.getBankInfoByEntityAccountId(finalEntityAccountId);
    if (existing) {
      return res.status(400).json({
        status: "error",
        message: "Tài khoản này đã có thông tin ngân hàng. Vui lòng sử dụng chức năng cập nhật.",
        error: "Tài khoản này đã có thông tin ngân hàng",
        existingBankInfo: existing
      });
    }
    
    console.log("💾 Creating bank info with:", {
      entityAccountId: finalEntityAccountId,
      bankName,
      accountNumber: accountNumber.substring(0, 4) + "***" // Chỉ log một phần để bảo mật
    });
    
    const bankInfo = await bankInfoModel.createBankInfo({
      bankName,
      accountNumber,
      accountHolderName,
      entityAccountId: finalEntityAccountId,
    });
    
    console.log("✅ Bank info created successfully:", {
      BankInfoId: bankInfo?.BankInfoId,
      EntityAccountId: bankInfo?.EntityAccountId
    });

    return res.status(201).json(success("Tạo thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("❌ createBankInfo error:", err);
    const parsedError = parseSqlError(err);
    
    // Handle unique constraint violation (SQL Server error 2627 hoặc 2601)
    if (parsedError.isUniqueViolation || err.message?.includes("UNIQUE") || err.message?.includes("duplicate")) {
      // Fetch existing BankInfo
      const { entityAccountId, accountId, barPageId } = req.body;
      let entityAccountIdToFetch = entityAccountId;
      
      if (!entityAccountIdToFetch && (accountId || barPageId)) {
        entityAccountIdToFetch = await normalizeToEntityAccountId(accountId || barPageId);
      }
      
      if (entityAccountIdToFetch) {
        const existing = await bankInfoModel.getBankInfoByEntityAccountId(entityAccountIdToFetch);
        if (existing) {
          return res.status(400).json({
            status: "error",
            message: "Tài khoản này đã có thông tin ngân hàng. Vui lòng sử dụng chức năng cập nhật.",
            error: "Tài khoản này đã có thông tin ngân hàng",
            existingBankInfo: existing
          });
        }
      }
      
      return res.status(400).json({
        status: "error",
        message: "Không thể tạo thông tin ngân hàng. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
        error: "Unique constraint violation"
      });
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


// ✏️ Cập nhật BankInfo
exports.updateBankInfo = async (req, res) => {
  try {
    const { bankInfoId } = req.params;
    const { bankName, accountNumber, accountHolderName } = req.body;

    if (!bankName && !accountNumber && !accountHolderName) {
      return res.status(400).json(error("Phải có ít nhất một trường để cập nhật"));
    }

    // Validate accountNumber nếu có
    if (accountNumber && !/^\d+$/.test(accountNumber)) {
      return res.status(400).json(error("Số tài khoản chỉ được chứa số"));
    }

    const updated = await bankInfoModel.updateBankInfo(bankInfoId, { bankName, accountNumber, accountHolderName });

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

