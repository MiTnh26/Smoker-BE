const bankInfoModel = require("../models/bankInfoModel");
const { success, error } = require("../utils/response");

// ➕ Tạo BankInfo mới
exports.createBankInfo = async (req, res) => {
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

    // Kiểm tra xem đã có BankInfo cho accountId hoặc barPageId chưa
    if (accountId) {
      const existing = await bankInfoModel.getBankInfoByAccountId(accountId);
      if (existing) {
        return res.status(400).json(error("Tài khoản này đã có thông tin ngân hàng"));
      }
    }

    if (barPageId) {
      const existing = await bankInfoModel.getBankInfoByBarPageId(barPageId);
      if (existing) {
        return res.status(400).json(error("Bar page này đã có thông tin ngân hàng"));
      }
    }

    const bankInfo = await bankInfoModel.createBankInfo({
      bankName,
      accountNumber,
      accountId: accountId || null,
      barPageId: barPageId || null,
    });

    return res.status(201).json(success("Tạo thông tin ngân hàng thành công", bankInfo));
  } catch (err) {
    console.error("createBankInfo error:", err);
    
    // Handle unique constraint violation
    if (err.number === 2627 || err.message.includes("UNIQUE")) {
      return res.status(400).json(error("Tài khoản này đã có thông tin ngân hàng"));
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

