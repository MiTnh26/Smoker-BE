const walletModel = require("../models/walletModel");
const withdrawRequestModel = require("../models/withdrawRequestModel");
const { getPool } = require("../db/sqlserver");
const { success, error } = require("../utils/response");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");
const bcrypt = require("bcryptjs");

/**
 * Lấy thông tin ví của user hiện tại
 */
async function getWallet(req, res) {
  try {
    const accountId = req.user.id;
    
    // Lấy EntityAccountId từ AccountId
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    let wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    
    // Tạo wallet nếu chưa có
    if (!wallet) {
      wallet = await walletModel.createWallet(entityAccountId);
    }
    
    // Kiểm tra trạng thái lock
    const lockStatus = await walletModel.checkWalletLocked(wallet.WalletId);
    
    return res.json(success("Lấy thông tin ví thành công", {
      walletId: wallet.WalletId,
      balance: parseFloat(wallet.Balance),
      lockedBalance: parseFloat(wallet.LockedBalance),
      availableBalance: Math.max(0, parseFloat(wallet.Balance) - parseFloat(wallet.LockedBalance)),
      status: wallet.Status,
      hasPin: !!wallet.PinHash,
      isLocked: lockStatus.isLocked,
      lockedUntil: lockStatus.lockedUntil
    }));
  } catch (e) {
    console.error("getWallet error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

/**
 * Lấy lịch sử giao dịch
 */
async function getTransactionHistory(req, res) {
  try {
    const accountId = req.user.id;
    const { limit = 50, offset = 0, type, status } = req.query;
    
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    const wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    if (!wallet) {
      return res.json(success("Lịch sử giao dịch", { transactions: [], total: 0 }));
    }
    
    const transactions = await walletModel.getTransactions(wallet.WalletId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      type,
      status
    });
    
    const total = await walletModel.countTransactions(wallet.WalletId, { type, status });
    
    return res.json(success("Lấy lịch sử thành công", {
      transactions: transactions.map(t => ({
        id: t.TransactionId,
        type: t.TransactionType,
        amount: parseFloat(t.Amount),
        balanceBefore: parseFloat(t.BalanceBefore),
        balanceAfter: parseFloat(t.BalanceAfter),
        sourceType: t.SourceType,
        sourceId: t.SourceId,
        status: t.Status,
        description: t.Description,
        createdAt: t.CreatedAt
      })),
      total
    }));
  } catch (e) {
    console.error("getTransactionHistory error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

/**
 * Set PIN cho wallet
 */
async function setPin(req, res) {
  try {
    const accountId = req.user.id;
    const { pin } = req.body;
    
    // Validate PIN: 6 số
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json(error("PIN phải là 6 chữ số"));
    }
    
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    // Tạo wallet nếu chưa có
    let wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    if (!wallet) {
      wallet = await walletModel.createWallet(entityAccountId);
    }
    
    // Kiểm tra đã có PIN chưa
    if (wallet.PinHash) {
      return res.status(400).json(error("Ví đã có PIN. Vui lòng sử dụng chức năng đổi PIN"));
    }
    
    // Hash PIN
    const pinHash = await bcrypt.hash(pin, 10);
    
    // Set PIN
    const updated = await walletModel.setWalletPin(wallet.WalletId, pinHash);
    if (!updated) {
      return res.status(400).json(error("Không thể set PIN. Ví có thể đã có PIN"));
    }
    
    return res.json(success("Set PIN thành công"));
  } catch (e) {
    console.error("setPin error:", e);
    console.error("Error stack:", e.stack);
    
    // Trả về message lỗi chi tiết hơn
    if (e.message) {
      if (e.message.includes("đã có PIN")) {
        return res.status(400).json(error(e.message));
      }
      if (e.message.includes("không tồn tại")) {
        return res.status(404).json(error(e.message));
      }
    }
    
    return res.status(500).json(error(e.message || "Lỗi máy chủ"));
  }
}

/**
 * Verify PIN
 */
async function verifyPin(req, res) {
  try {
    const accountId = req.user.id;
    const { pin } = req.body;
    
    // Validate PIN: 6 số
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json(error("PIN phải là 6 chữ số"));
    }
    
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    const wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    if (!wallet) {
      return res.status(404).json(error("Không tìm thấy ví"));
    }
    
    // Kiểm tra có PIN chưa
    if (!wallet.PinHash) {
      return res.status(400).json(error("Ví chưa có PIN. Vui lòng set PIN trước"));
    }
    
    // Verify PIN
    const result = await walletModel.verifyWalletPin(wallet.WalletId, pin);
    
    if (result.isLocked) {
      const lockedUntil = new Date(result.lockedUntil);
      const minutesLeft = Math.ceil((lockedUntil - new Date()) / (1000 * 60));
      return res.status(400).json(error(`Ví đã bị khóa. Vui lòng thử lại sau ${minutesLeft} phút`));
    }
    
    if (!result.isValid) {
      return res.status(400).json(error("PIN không đúng"));
    }
    
    return res.json(success("Xác thực PIN thành công"));
  } catch (e) {
    console.error("verifyPin error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

/**
 * Tạo yêu cầu rút tiền (yêu cầu verify PIN)
 */
async function createWithdrawRequest(req, res) {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    const accountId = req.user.id;
    const { amount, bankInfoId, pin } = req.body;
    
    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json(error("Số tiền không hợp lệ"));
    }
    
    if (!bankInfoId) {
      await transaction.rollback();
      return res.status(400).json(error("Vui lòng chọn tài khoản ngân hàng"));
    }
    
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    const wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    if (!wallet) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy ví"));
    }
    
    // Kiểm tra wallet có PIN chưa
    if (!wallet.PinHash) {
      await transaction.rollback();
      return res.status(400).json(error("Ví chưa có PIN. Vui lòng set PIN trước khi rút tiền"));
    }
    
    // Kiểm tra wallet có bị lock không
    const lockStatus = await walletModel.checkWalletLocked(wallet.WalletId);
    if (lockStatus.isLocked) {
      await transaction.rollback();
      const lockedUntil = new Date(lockStatus.lockedUntil);
      const minutesLeft = Math.ceil((lockedUntil - new Date()) / (1000 * 60));
      return res.status(400).json(error(`Ví đã bị khóa. Vui lòng thử lại sau ${minutesLeft} phút`));
    }
    
    // Verify PIN
    if (!pin || !/^\d{6}$/.test(pin)) {
      await transaction.rollback();
      return res.status(400).json(error("PIN không hợp lệ"));
    }
    
    const pinVerify = await walletModel.verifyWalletPin(wallet.WalletId, pin);
    if (!pinVerify.isValid) {
      await transaction.rollback();
      if (pinVerify.isLocked) {
        const lockedUntil = new Date(pinVerify.lockedUntil);
        const minutesLeft = Math.ceil((lockedUntil - new Date()) / (1000 * 60));
        return res.status(400).json(error(`PIN sai. Ví đã bị khóa ${minutesLeft} phút`));
      }
      return res.status(400).json(error("PIN không đúng"));
    }
    
    const availableBalance = Math.max(0, parseFloat(wallet.Balance) - parseFloat(wallet.LockedBalance));
    if (availableBalance < amount) {
      await transaction.rollback();
      return res.status(400).json(error("Số dư khả dụng không đủ"));
    }
    
    // Khóa tiền
    const updatedWallet = await walletModel.lockBalance(wallet.WalletId, amount, transaction);
    if (!updatedWallet) {
      await transaction.rollback();
      return res.status(400).json(error("Không thể khóa số tiền này"));
    }
    
    // Tạo yêu cầu rút tiền (trong transaction)
    const withdrawRequest = await withdrawRequestModel.createWithdrawRequest({
      walletId: wallet.WalletId,
      amount,
      bankInfoId
    }, transaction);
    
    // Tạo transaction record
    await walletModel.createTransaction({
      walletId: wallet.WalletId,
      transactionType: 'withdraw',
      amount: parseFloat(amount),
      balanceBefore: parseFloat(wallet.Balance),
      balanceAfter: parseFloat(updatedWallet.Balance),
      sourceType: 'WithdrawalRequest',
      sourceId: withdrawRequest.WithdrawRequestId,
      status: 'pending',
      description: `Yêu cầu rút tiền - Đang chờ duyệt`
    }, transaction);
    
    await transaction.commit();
    
    return res.json(success("Gửi yêu cầu rút tiền thành công", {
      withdrawRequestId: withdrawRequest.WithdrawRequestId,
      amount: parseFloat(amount),
      status: 'pending',
      balance: parseFloat(updatedWallet.Balance),
      lockedBalance: parseFloat(updatedWallet.LockedBalance)
    }));
  } catch (e) {
    await transaction.rollback();
    console.error("createWithdrawRequest error:", e);
    console.error("Error stack:", e.stack);
    console.error("Error details:", {
      message: e.message,
      number: e.number,
      code: e.code
    });
    
    // Trả về message lỗi chi tiết hơn nếu có
    const errorMessage = e.message || "Lỗi máy chủ";
    return res.status(500).json(error(errorMessage));
  }
}

/**
 * Lấy danh sách yêu cầu rút tiền của user
 */
async function getWithdrawRequests(req, res) {
  try {
    const accountId = req.user.id;
    const { status, limit = 5, offset = 0 } = req.query;
    
    const entityAccountId = await getEntityAccountIdByAccountId(accountId);
    if (!entityAccountId) {
      return res.status(404).json(error("Không tìm thấy EntityAccount"));
    }
    
    const wallet = await walletModel.getWalletByEntityAccountId(entityAccountId);
    if (!wallet) {
      return res.json(success("Danh sách yêu cầu rút tiền", { requests: [] }));
    }
    
    const requests = await withdrawRequestModel.getWithdrawRequestsByWalletId(wallet.WalletId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status
    });
    
    return res.json(success("Lấy danh sách thành công", {
      requests: requests.map(r => ({
        id: r.WithdrawRequestId,
        amount: parseFloat(r.Amount),
        status: r.Status,
        bankName: r.BankName,
        accountNumber: r.AccountNumber,
        accountHolderName: r.AccountHolderName,
        requestedAt: r.RequestedAt,
        reviewedAt: r.ReviewedAt,
        note: r.Note
      }))
    }));
  } catch (e) {
    console.error("getWithdrawRequests error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

module.exports = {
  getWallet,
  getTransactionHistory,
  createWithdrawRequest,
  getWithdrawRequests,
  setPin,
  verifyPin
};

