const userAdvertisementModel = require("../models/userAdvertisementModel");
const adPurchaseModel = require("../models/adPurchaseModel");
const adSyncLogModel = require("../models/adSyncLogModel");

/**
 * Ad Impression Service
 * Xử lý việc cập nhật impression counts khi quảng cáo được hiển thị
 */
class AdImpressionService {

  /**
   * Cập nhật impression counts cho dynamic ad
   * @param {string} userAdId - ID của UserAdvertisement
   * @param {string} barPageId - ID của BarPage (cho logging)
   * @returns {Object} Kết quả cập nhật
   */
  async updateDynamicAdImpressions(userAdId, barPageId) {
    try {
      // Lấy thông tin ad hiện tại
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        throw new Error(`Ad ${userAdId} not found`);
      }

      if (ad.Status !== 'active') {
        console.warn(`[AdImpression] Ad ${userAdId} is not active (status: ${ad.Status})`);
        return { success: false, reason: 'ad_not_active' };
      }

      if ((ad.RemainingImpressions || 0) <= 0) {
        console.warn(`[AdImpression] Ad ${userAdId} has no remaining impressions`);
        // Có thể tự động pause ad ở đây
        await userAdvertisementModel.updateAdStatus(userAdId, { status: 'paused' });
        return { success: false, reason: 'no_remaining_impressions' };
      }

      // Cập nhật impression counts
      const newRemainingImpressions = (ad.RemainingImpressions || 0) - 1;
      const newTotalImpressions = (ad.TotalImpressions || 0) + 1;

      await userAdvertisementModel.updateAdStatus(userAdId, {
        remainingImpressions: newRemainingImpressions,
        totalImpressions: newTotalImpressions
      });

      // Log impression vào AdSyncLogs (cho thống kê)
      await adSyncLogModel.createSyncLog({
        userAdId,
        reviveBannerId: ad.ReviveBannerId || 'unknown',
        impressions: 1, // Chỉ log 1 impression
        syncType: 'impression_update',
        syncStatus: 'success'
      });

      // Kiểm tra nếu hết impressions, cập nhật status
      if (newRemainingImpressions <= 0) {
        await userAdvertisementModel.updateAdStatus(userAdId, { status: 'completed' });
        console.log(`[AdImpression] Ad ${userAdId} completed (no remaining impressions)`);
      }

      return {
        success: true,
        adId: userAdId,
        remainingImpressions: newRemainingImpressions,
        totalImpressions: newTotalImpressions,
        status: newRemainingImpressions <= 0 ? 'completed' : 'active'
      };

    } catch (error) {
      console.error(`[AdImpression] Error updating dynamic ad impressions for ${userAdId}:`, error);

      // Log error
      try {
        await adSyncLogModel.createSyncLog({
          userAdId,
          reviveBannerId: 'unknown',
          syncType: 'impression_update',
          syncStatus: 'failed',
          errorMessage: error.message
        });
      } catch (logError) {
        console.error(`[AdImpression] Failed to log error:`, logError);
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Cập nhật impression cho static ad (chỉ log, không cần cập nhật count)
   * @param {string} advertisementId - ID của static advertisement
   * @param {string} barPageId - ID của BarPage
   * @returns {Object} Kết quả
   */
  async updateStaticAdImpressions(advertisementId, barPageId) {
    // Static ads không cần cập nhật count, chỉ log impression
    // Logic này đã được xử lý trong adAuctionService.getAdAfterAuction
    return {
      success: true,
      adId: advertisementId,
      type: 'static',
      message: 'Static ad impression logged'
    };
  }

  /**
   * Cập nhật click count cho ad
   * @param {string} adId - ID của advertisement (có thể là UserAdId hoặc AdvertisementId)
   * @param {string} adType - 'dynamic' hoặc 'static'
   * @returns {Object} Kết quả cập nhật
   */
  async updateAdClicks(adId, adType = 'dynamic') {
    try {
      if (adType === 'dynamic') {
        // Cập nhật cho UserAdvertisement
        const ad = await userAdvertisementModel.findById(adId);
        if (!ad) {
          throw new Error(`Dynamic ad ${adId} not found`);
        }

        const newTotalClicks = (ad.TotalClicks || 0) + 1;
        await userAdvertisementModel.updateAdStatus(adId, {
          totalClicks: newTotalClicks
        });

        return {
          success: true,
          adId,
          type: 'dynamic',
          totalClicks: newTotalClicks
        };

      } else {
        // Static ad - có thể cần cập nhật bảng Advertisements nếu có trường click count
        // Hiện tại chỉ log
        return {
          success: true,
          adId,
          type: 'static',
          message: 'Static ad click logged'
        };
      }

    } catch (error) {
      console.error(`[AdImpression] Error updating clicks for ${adType} ad ${adId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync impression data từ Revive (cho reconciliation)
   * @param {string} userAdId - ID của UserAdvertisement
   * @param {Object} reviveStats - Stats từ Revive API
   * @returns {Object} Kết quả sync
   */
  async syncImpressionsFromRevive(userAdId, reviveStats) {
    try {
      const { impressions: reviveImpressions, clicks: reviveClicks } = reviveStats;

      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        throw new Error(`Ad ${userAdId} not found`);
      }

      // So sánh với dữ liệu local
      const localImpressions = ad.TotalImpressions || 0;
      const localClicks = ad.TotalClicks || 0;

      // Tính chênh lệch
      const impressionDiff = reviveImpressions - localImpressions;
      const clickDiff = reviveClicks - localClicks;

      // Cập nhật nếu có chênh lệch
      if (impressionDiff !== 0 || clickDiff !== 0) {
        await userAdvertisementModel.updateAdStatus(userAdId, {
          totalImpressions: reviveImpressions,
          totalClicks: reviveClicks,
          // Tính lại remaining impressions dựa trên purchased
          remainingImpressions: Math.max(0, (ad.RemainingImpressions || 0) - impressionDiff)
        });

        console.log(`[AdImpression] Synced ad ${userAdId}: impressions ${localImpressions} -> ${reviveImpressions}, clicks ${localClicks} -> ${reviveClicks}`);
      }

      // Log sync
      await adSyncLogModel.createSyncLog({
        userAdId,
        reviveBannerId: ad.ReviveBannerId || 'unknown',
        impressions: reviveImpressions,
        clicks: reviveClicks,
        syncType: 'revive_sync',
        syncStatus: 'success'
      });

      return {
        success: true,
        adId: userAdId,
        syncedImpressions: reviveImpressions,
        syncedClicks: reviveClicks,
        impressionDiff,
        clickDiff
      };

    } catch (error) {
      console.error(`[AdImpression] Error syncing impressions for ${userAdId}:`, error);

      // Log error
      await adSyncLogModel.createSyncLog({
        userAdId,
        reviveBannerId: 'unknown',
        syncType: 'revive_sync',
        syncStatus: 'failed',
        errorMessage: error.message
      });

      return { success: false, error: error.message };
    }
  }
}

module.exports = new AdImpressionService();

