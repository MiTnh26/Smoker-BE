const userAdvertisementModel = require("../models/userAdvertisementModel");
const advertisementModel = require("../models/advertisementModel");
const staticAdRotationModel = require("../models/staticAdRotationModel");
const adDisplayLogModel = require("../models/adDisplayLogModel");
const adImpressionService = require("./adImpressionService");
const { calculateAdScore, rankAdsByScore, MIN_SCORE_THRESHOLD } = require("../utils/adScoring");

/**
 * Ad Auction Service
 * Xử lý logic đấu giá và quyết định quảng cáo nào được hiển thị
 *
 * Luồng hoạt động:
 * 1. Lấy tất cả dynamic ads active cho BarPage
 * 2. Tính score cho mỗi ad theo công thức
 * 3. Chọn ad có score cao nhất
 * 4. Fallback về static ads nếu không có dynamic ads phù hợp
 */
class AdAuctionService {

  /**
   * Chạy phiên đấu giá và quyết định ad nào hiển thị
   * @param {string} barPageId - ID của BarPage
   * @param {string} zoneId - ID của zone (từ Revive)
   * @param {Object} context - Thông tin ngữ cảnh (user, location, time, etc.)
   * @returns {Object} Kết quả đấu giá { type: 'dynamic'|'static', ad: {...}, score: number }
   */
  async runAuction(barPageId, zoneId = "1", context = {}) {
    try {
      console.log(`[AdAuction] Starting auction for BarPage ${barPageId}, Zone ${zoneId}`);

      // 1. Lấy tất cả dynamic ads active cho BarPage này
      const dynamicAds = await userAdvertisementModel.getAdsByBarPage(barPageId);
      const activeDynamicAds = dynamicAds.filter(ad => ad.Status === 'active');

      console.log(`[AdAuction] Found ${activeDynamicAds.length} active dynamic ads`);

      // 2. Ranking ads theo score
      const rankedAds = rankAdsByScore(activeDynamicAds, context);

      // 3. Chọn ad có score cao nhất nếu đủ threshold
      if (rankedAds.length > 0 && rankedAds[0].score >= MIN_SCORE_THRESHOLD) {
        const winner = rankedAds[0];
        console.log(`[AdAuction] Winner: Dynamic ad ${winner.ad.UserAdId} with score ${winner.score}`);

        return {
          type: 'dynamic',
          ad: winner.ad,
          score: winner.score,
          auctionResult: {
            totalCandidates: rankedAds.length,
            winnerScore: winner.score,
            threshold: MIN_SCORE_THRESHOLD
          }
        };
      }

      // 4. Fallback về static ads nếu không có dynamic ads phù hợp
      console.log(`[AdAuction] No dynamic ads qualified (score < ${MIN_SCORE_THRESHOLD}), falling back to static ads`);
      const staticAd = await this.getNextStaticAd(barPageId);

      return {
        type: 'static',
        ad: staticAd,
        score: 0,
        auctionResult: {
          totalCandidates: rankedAds.length,
          reason: 'no_dynamic_ads_qualified',
          fallback: 'static'
        }
      };

    } catch (error) {
      console.error(`[AdAuction] Auction failed for BarPage ${barPageId}:`, error);

      // Fallback về static ads trong trường hợp lỗi
      try {
        const staticAd = await this.getNextStaticAd(barPageId);
        return {
          type: 'static',
          ad: staticAd,
          score: 0,
          auctionResult: {
            error: error.message,
            fallback: 'static_error'
          }
        };
      } catch (staticError) {
        console.error(`[AdAuction] Static ad fallback also failed:`, staticError);
        return {
          type: 'none',
          ad: null,
          score: 0,
          auctionResult: {
            error: 'both_dynamic_and_static_failed',
            details: `${error.message} | ${staticError.message}`
          }
        };
      }
    }
  }

  /**
   * Lấy quảng cáo tĩnh theo rotation (fallback)
   * @param {string} barPageId - ID của BarPage
   * @returns {Object} Static ad object
   */
  async getNextStaticAd(barPageId) {
    try {
      // Lấy danh sách static ads
      const staticAds = await advertisementModel.getActiveStaticAds();
      if (!staticAds.length) {
        console.warn(`[AdAuction] No static ads available`);
        return null;
      }

      // Lấy rotation hiện tại cho BarPage
      const rotation = await staticAdRotationModel.getRotation(barPageId);
      const nextIndex = rotation ? rotation.CurrentRotationIndex : 0;
      const ad = staticAds[nextIndex % staticAds.length];

      // Cập nhật rotation
      await staticAdRotationModel.saveRotation({
        barPageId,
        advertisementId: ad.AdvertisementId,
        nextIndex: (nextIndex + 1) % staticAds.length
      });

      console.log(`[AdAuction] Selected static ad: ${ad.AdvertisementId} (index ${nextIndex})`);
      return ad;

    } catch (error) {
      console.error(`[AdAuction] Error getting static ad:`, error);
      return null;
    }
  }

  /**
   * Lấy quảng cáo sau khi đấu giá (wrapper cho controller)
   * @param {string} barPageId - ID của BarPage
   * @param {string} zoneId - ID của zone
   * @param {Object} context - Thông tin ngữ cảnh
   * @returns {Object} Ad data để trả về frontend
   */
  async getAdAfterAuction(barPageId, zoneId = "1", context = {}) {
    const auctionResult = await this.runAuction(barPageId, zoneId, context);

      // Log impression và cập nhật counts
      if (auctionResult.ad) {
        try {
          const displayType = auctionResult.type === 'dynamic' ? 'dynamic_auction' : 'static_fallback';

          // Log vào AdDisplayLogs (cho cả dynamic và static)
          await adDisplayLogModel.createImpression({
            advertisementId: auctionResult.ad.AdvertisementId || auctionResult.ad.UserAdId,
            barPageId,
            accountId: context.accountId || null,
            displayType,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
          });

          // Nếu là dynamic ad, cập nhật impression counts
          if (auctionResult.type === 'dynamic') {
            const impressionUpdate = await adImpressionService.updateDynamicAdImpressions(
              auctionResult.ad.UserAdId,
              barPageId
            );

            if (impressionUpdate.success) {
              console.log(`[AdAuction] Updated dynamic ad impressions: ${JSON.stringify(impressionUpdate)}`);
            } else {
              console.warn(`[AdAuction] Failed to update dynamic ad impressions:`, impressionUpdate);
            }
          }

          console.log(`[AdAuction] Logged impression for ${auctionResult.type} ad: ${auctionResult.ad.AdvertisementId || auctionResult.ad.UserAdId}`);

        } catch (logError) {
          console.error(`[AdAuction] Failed to log/update impression:`, logError);
        }
      }

    return auctionResult;
  }

  /**
   * Format ad data để trả về frontend
   * @param {Object} auctionResult - Kết quả từ runAuction
   * @returns {Object} Formatted ad data
   */
  formatAdForFrontend(auctionResult) {
    if (!auctionResult.ad) {
      return null;
    }

    const { ad, type, score } = auctionResult;

    if (type === 'dynamic') {
      // Format dynamic ad (từ UserAdvertisements)
      return {
        advertisementId: ad.UserAdId,
        type: 'dynamic',
        title: ad.Title,
        imageUrl: ad.ImageUrl,
        redirectUrl: ad.RedirectUrl,
        bidAmount: ad.BidAmount,
        pricingModel: ad.PricingModel,
        score: score,
        auctionData: auctionResult.auctionResult
      };
    } else {
      // Format static ad (từ Advertisements)
      return {
        advertisementId: ad.AdvertisementId,
        type: 'static',
        title: ad.Title,
        imageUrl: ad.ImageUrl,
        videoUrl: ad.VideoUrl,
        redirectUrl: ad.RedirectUrl,
        adType: ad.AdType,
        score: score,
        auctionData: auctionResult.auctionResult
      };
    }
  }

  /**
   * Lấy thống kê đấu giá cho admin dashboard
   * @param {Date} startDate - Ngày bắt đầu
   * @param {Date} endDate - Ngày kết thúc
   * @returns {Object} Thống kê đấu giá
   */
  async getAuctionStats(startDate = null, endDate = null) {
    try {
      // Thống kê từ AdDisplayLogs
      const stats = await adDisplayLogModel.getStatsByDateRange(startDate, endDate);

      // Thêm thông tin về auction
      const dynamicImpressions = stats.find(s => s.displayType === 'dynamic_auction')?.totalImpressions || 0;
      const staticImpressions = stats.find(s => s.displayType === 'static_fallback')?.totalImpressions || 0;
      const totalImpressions = dynamicImpressions + staticImpressions;

      return {
        totalImpressions,
        dynamicImpressions,
        staticImpressions,
        dynamicPercentage: totalImpressions > 0 ? (dynamicImpressions / totalImpressions * 100).toFixed(2) : 0,
        staticPercentage: totalImpressions > 0 ? (staticImpressions / totalImpressions * 100).toFixed(2) : 0,
        period: {
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString()
        }
      };

    } catch (error) {
      console.error(`[AdAuction] Error getting auction stats:`, error);
      return {
        totalImpressions: 0,
        dynamicImpressions: 0,
        staticImpressions: 0,
        dynamicPercentage: 0,
        staticPercentage: 0,
        error: error.message
      };
    }
  }
}

module.exports = new AdAuctionService();

