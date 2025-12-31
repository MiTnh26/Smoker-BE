const walletModel = require("../models/walletModel");
const withdrawRequestModel = require("../models/withdrawRequestModel");
const { getPool } = require("../db/sqlserver");
const { success, error } = require("../utils/response");
const { getEntityAccountIdByAccountId } = require("../models/entityAccountModel");

/**
 * Lấy tất cả yêu cầu rút tiền (cho admin/kế toán)
 */
async function getAllWithdrawRequests(req, res) {
  try {
    const { status, limit = 50 } = req.query;
    
    const requests = await withdrawRequestModel.getAllWithdrawRequests({
      limit: parseInt(limit),
      status
    });
    
    return res.json(success("Lấy danh sách thành công", {
      requests: requests.map(r => ({
        id: r.WithdrawRequestId,
        walletId: r.WalletId,
        amount: parseFloat(r.Amount),
        status: r.Status,
        bankName: r.BankName,
        accountNumber: r.AccountNumber,
        entityType: r.EntityType,
        requestedAt: r.RequestedAt,
        reviewedAt: r.ReviewedAt,
        note: r.Note
      }))
    }));
  } catch (e) {
    console.error("getAllWithdrawRequests error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

/**
 * Duyệt yêu cầu rút tiền
 */
async function approveWithdrawRequest(req, res) {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    const { withdrawRequestId } = req.params;
    const { note } = req.body;
    const reviewerId = req.user.id; // ManagerId hoặc AccountId
    const userType = req.user.type; // "manager" hoặc undefined
    
    // ReviewedBy phải là ManagerId (foreign key constraint)
    // Nếu là Manager, dùng ManagerId trực tiếp
    // Nếu là Admin (từ Accounts), không thể duyệt (chỉ Manager mới duyệt được)
    let reviewerManagerId = null;
    if (userType === "manager") {
      reviewerManagerId = reviewerId; // Đây là ManagerId
    } else {
      // Admin từ Accounts table không thể duyệt (vì ReviewedBy phải là ManagerId)
      await transaction.rollback();
      return res.status(403).json(error("Chỉ Manager mới có thể duyệt yêu cầu rút tiền"));
    }
    
    const request = await withdrawRequestModel.getWithdrawRequestById(withdrawRequestId);
    if (!request) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy yêu cầu"));
    }
    
    if (request.Status !== 'pending') {
      await transaction.rollback();
      return res.status(400).json(error("Yêu cầu này đã được xử lý"));
    }
    
    // Duyệt yêu cầu (truyền ManagerId)
    const approved = await withdrawRequestModel.approveWithdrawRequest(
      withdrawRequestId,
      reviewerManagerId,
      note,
      transaction
    );
    
    if (!approved) {
      await transaction.rollback();
      return res.status(400).json(error("Không thể duyệt yêu cầu này"));
    }
    
    // Giải phóng locked balance
    const wallet = await walletModel.getWalletById(request.WalletId, transaction);
    if (!wallet) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy ví"));
    }
    
    const releaseResult = await walletModel.releaseLockedBalance(wallet.WalletId, parseFloat(request.Amount), transaction);
    if (!releaseResult) {
      await transaction.rollback();
      return res.status(400).json(error("Không thể giải phóng số tiền này"));
    }
    
    // Tạo transaction record
    await walletModel.createTransaction({
      walletId: wallet.WalletId,
      transactionType: 'withdraw',
      amount: parseFloat(request.Amount),
      balanceBefore: parseFloat(wallet.Balance),
      balanceAfter: parseFloat(wallet.Balance), // Balance không đổi, chỉ giảm LockedBalance
      sourceType: 'WithdrawalRequest',
      sourceId: withdrawRequestId,
      status: 'completed',
      description: `Rút tiền thành công - ${note || ''}`
    }, transaction);
    
    await transaction.commit();
    
    return res.json(success("Duyệt yêu cầu thành công", {
      withdrawRequestId: approved.WithdrawRequestId,
      status: approved.Status
    }));
  } catch (e) {
    await transaction.rollback();
    console.error("approveWithdrawRequest error:", e);
    return res.status(500).json(error("Lỗi máy chủ"));
  }
}

/**
 * Từ chối yêu cầu rút tiền
 */
async function rejectWithdrawRequest(req, res) {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    const { withdrawRequestId } = req.params;
    const { note } = req.body;
    const reviewerId = req.user.id; // ManagerId hoặc AccountId
    const userType = req.user.type; // "manager" hoặc undefined
    
    if (!note) {
      await transaction.rollback();
      return res.status(400).json(error("Vui lòng nhập lý do từ chối"));
    }
    
    // ReviewedBy phải là ManagerId (foreign key constraint)
    // Nếu là Manager, dùng ManagerId trực tiếp
    // Nếu là Admin (từ Accounts), không thể duyệt (chỉ Manager mới duyệt được)
    let reviewerManagerId = null;
    if (userType === "manager") {
      reviewerManagerId = reviewerId; // Đây là ManagerId
    } else {
      // Admin từ Accounts table không thể duyệt (vì ReviewedBy phải là ManagerId)
      await transaction.rollback();
      return res.status(403).json(error("Chỉ Manager mới có thể duyệt yêu cầu rút tiền"));
    }
    
    const request = await withdrawRequestModel.getWithdrawRequestById(withdrawRequestId);
    if (!request) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy yêu cầu"));
    }
    
    if (request.Status !== 'pending') {
      await transaction.rollback();
      return res.status(400).json(error("Yêu cầu này đã được xử lý"));
    }
    
    // Từ chối yêu cầu (truyền ManagerId)
    const rejected = await withdrawRequestModel.rejectWithdrawRequest(
      withdrawRequestId,
      reviewerManagerId,
      note,
      transaction
    );
    
    if (!rejected) {
      await transaction.rollback();
      return res.status(400).json(error("Không thể từ chối yêu cầu này"));
    }
    
    // Mở khóa tiền (trả lại vào Balance)
    const wallet = await walletModel.getWalletById(request.WalletId, transaction);
    if (!wallet) {
      await transaction.rollback();
      return res.status(404).json(error("Không tìm thấy ví"));
    }
    
    const unlockResult = await walletModel.unlockBalance(wallet.WalletId, parseFloat(request.Amount), transaction);
    if (!unlockResult) {
      await transaction.rollback();
      return res.status(400).json(error("Không thể mở khóa số tiền này"));
    }
    
    // Sử dụng unlockResult để có balance mới (đã được update trong transaction)
    // Tạo transaction record
    await walletModel.createTransaction({
      walletId: wallet.WalletId,
      transactionType: 'withdraw_reject',
      amount: parseFloat(request.Amount),
      balanceBefore: parseFloat(wallet.Balance),
      balanceAfter: parseFloat(unlockResult.Balance), // Sử dụng balance từ unlockResult
      sourceType: 'WithdrawalRequest',
      sourceId: withdrawRequestId,
      status: 'completed',
      description: `Yêu cầu rút tiền bị từ chối - ${note}`
    }, transaction);
    
    await transaction.commit();
    
    return res.json(success("Từ chối yêu cầu thành công"));
  } catch (e) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error rolling back transaction:", rollbackError);
      }
    }
    console.error("rejectWithdrawRequest error:", e);
    return res.status(500).json(error(e.message || "Lỗi máy chủ"));
  }
}

module.exports = {
  getAllWithdrawRequests,
  approveWithdrawRequest,
  rejectWithdrawRequest
};

