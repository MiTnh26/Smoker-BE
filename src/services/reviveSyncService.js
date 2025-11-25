const axios = require("axios");
const userAdvertisementModel = require("../models/userAdvertisementModel");
const adSyncLogModel = require("../models/adSyncLogModel");
const { getPool, sql } = require("../db/sqlserver");

class ReviveSyncService {
  constructor() {
    this.baseUrl = process.env.REVIVE_AD_SERVER_URL || "http://localhost/revive";
  }

  /**
   * Lấy stats từ Revive Ad Server cho một banner
   * Sử dụng Revive XML-RPC API hoặc web scraping
   * TODO: Implement actual API call to Revive
   */
  async getBannerStats(bannerId, startDate = null, endDate = null) {
    try {
      // Revive có XML-RPC API hoặc có thể scrape từ Statistics page
      // Tạm thời return structure, sẽ implement sau
      
      // Ví dụ URL: ${this.baseUrl}/www/admin/statistics-banner.php?bannerid=${bannerId}
      
      // TODO: Implement actual API call to Revive
      // For now, return mock structure
      console.log(`[ReviveSyncService] Getting stats for banner ${bannerId}`);
      
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        ctr: 0
      };
    } catch (error) {
      console.error("[ReviveSyncService] Error fetching banner stats:", error);
      return null;
    }
  }

  /**
   * Sync stats cho một ad từ Revive
   */
  async syncAdStats(userAdId) {
    try {
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad || !ad.ReviveBannerId) {
        console.warn(`[ReviveSyncService] Ad ${userAdId} không có ReviveBannerId`);
        return null;
      }

      // Lấy stats từ Revive
      const stats = await this.getBannerStats(ad.ReviveBannerId);
      if (!stats) {
        return null;
      }

      // Tính CTR
      const ctr = stats.impressions > 0 
        ? (stats.clicks / stats.impressions * 100) 
        : 0;

      // Update ad stats
      await userAdvertisementModel.updateAdStatus(userAdId, {
        totalImpressions: stats.impressions,
        totalClicks: stats.clicks,
        totalSpent: stats.spend
      });

      // Lưu sync log
      await adSyncLogModel.createSyncLog({
        userAdId,
        reviveBannerId: ad.ReviveBannerId,
        impressions: stats.impressions,
        clicks: stats.clicks,
        spend: stats.spend,
        ctr: parseFloat(ctr.toFixed(2)),
        syncType: 'stats',
        syncStatus: 'success'
      });

      return stats;
    } catch (error) {
      console.error(`[ReviveSyncService] Error syncing stats for ad ${userAdId}:`, error);
      
      // Log error
      try {
        const ad = await userAdvertisementModel.findById(userAdId);
        if (ad && ad.ReviveBannerId) {
          await adSyncLogModel.createSyncLog({
            userAdId,
            reviveBannerId: ad.ReviveBannerId,
            syncType: 'stats',
            syncStatus: 'failed',
            errorMessage: error.message
          });
        }
      } catch (logError) {
        console.error("[ReviveSyncService] Failed to log error:", logError);
      }
      
      return null;
    }
  }

  /**
   * Sync tất cả active ads
   */
  async syncAllActiveAds() {
    try {
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT UserAdId, ReviveBannerId
        FROM UserAdvertisements
        WHERE Status = 'active' AND ReviveBannerId IS NOT NULL
      `);

      const syncPromises = result.recordset.map(ad => 
        this.syncAdStats(ad.UserAdId).catch(err => {
          console.error(`[ReviveSyncService] Failed to sync ad ${ad.UserAdId}:`, err);
          return null;
        })
      );

      await Promise.all(syncPromises);
      console.log(`[ReviveSyncService] Synced ${result.recordset.length} active ads`);
      
      return { synced: result.recordset.length };
    } catch (error) {
      console.error("[ReviveSyncService] Error syncing all active ads:", error);
      throw error;
    }
  }
}

module.exports = new ReviveSyncService();


