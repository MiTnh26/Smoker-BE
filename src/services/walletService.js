const walletModel = require("../models/walletModel");
const { getPool } = require("../db/sqlserver");
const { verifyEntityAccountId } = require("../models/entityAccountModel");

/**
 * Xử lý tiền nhận từ booking - cộng vào ví của receiver
 * @param {string} bookedScheduleId - ID của booking
 * @param {string} receiverEntityAccountId - EntityAccountId của người nhận (DJ/Dancer/Bar)
 * @param {number} amount - Số tiền nhận được
 * @returns {Promise<{success: boolean, balance?: number, error?: string}>}
 */
async function processBookingIncome(bookedScheduleId, receiverEntityAccountId, amount) {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  try {
    await transaction.begin();
    
    // Verify EntityAccountId và lấy thông tin
    const entityInfo = await verifyEntityAccountId(receiverEntityAccountId);
    if (!entityInfo) {
      await transaction.rollback();
      return { success: false, error: "Không tìm thấy EntityAccount" };
    }
    
    // Lấy hoặc tạo wallet cho receiver (sử dụng EntityAccountId)
    let wallet = await walletModel.getWalletByEntityAccountId(receiverEntityAccountId);
    if (!wallet) {
      wallet = await walletModel.createWallet(receiverEntityAccountId);
    }
    
    const balanceBefore = parseFloat(wallet.Balance);
    const balanceAfter = balanceBefore + parseFloat(amount);
    
    // Cập nhật balance
    await walletModel.updateBalance(wallet.WalletId, amount, transaction);
    
    // Tạo transaction record
    await walletModel.createTransaction({
      walletId: wallet.WalletId,
      transactionType: 'booking_income',
      amount: parseFloat(amount),
      balanceBefore,
      balanceAfter,
      sourceType: 'Booking',
      sourceId: bookedScheduleId,
      status: 'completed',
      description: `Tiền nhận từ booking #${bookedScheduleId}`
    }, transaction);
    
    await transaction.commit();
    return { success: true, balance: balanceAfter };
  } catch (error) {
    await transaction.rollback();
    console.error('processBookingIncome error:', error);
    return { success: false, error: error.message || 'Lỗi xử lý tiền booking' };
  }
}

module.exports = {
  processBookingIncome
};

