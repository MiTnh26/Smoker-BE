const advertisementModel = require("../models/advertisementModel");
const adDisplayLogModel = require("../models/adDisplayLogModel");
const staticAdRotationModel = require("../models/staticAdRotationModel");
const reviveAdServerService = require("../services/reviveAdServerService");
const userAdvertisementModel = require("../models/userAdvertisementModel");
const adPackageModel = require("../models/adPackageModel");
const adPurchaseModel = require("../models/adPurchaseModel");
const paymentHistoryModel = require("../models/paymentHistoryModel");
const barPageModel = require("../models/barPageModel");
const notificationService = require("../services/notificationService");
const adAuctionService = require("../services/adAuctionService");
const adImpressionService = require("../services/adImpressionService");
const { getPool, sql } = require("../db/sqlserver");

function formatAd(adRow) {
  return {
    advertisementId: adRow.AdvertisementId,
    title: adRow.Title,
    imageUrl: adRow.ImageUrl,
    videoUrl: adRow.VideoUrl,
    redirectUrl: adRow.RedirectUrl,
    adType: adRow.AdType
  };
}

class AdController {
  async getStaticAd(req, res) {
    try {
      const { barPageId } = req.query;
      if (!barPageId) {
        return res.status(400).json({ success: false, message: "barPageId is required" });
      }

      const ads = await advertisementModel.getActiveStaticAds();
      if (!ads.length) {
        return res.status(404).json({ success: false, message: "No static ads available" });
      }

      const rotation = await staticAdRotationModel.getRotation(barPageId);
      const nextIndex = rotation ? rotation.CurrentRotationIndex : 0;
      const ad = ads[nextIndex % ads.length];

      await staticAdRotationModel.saveRotation({
        barPageId,
        advertisementId: ad.AdvertisementId,
        nextIndex: (nextIndex + 1) % ads.length
      });

      return res.json({ success: true, data: formatAd(ad) });
    } catch (error) {
      console.error("[AdController] getStaticAd error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async trackImpression(req, res) {
    try {
      const { advertisementId, barPageId, displayType = "static_rotation" } = req.body;
      if (!advertisementId || !barPageId) {
        return res.status(400).json({ success: false, message: "advertisementId and barPageId are required" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;
      const userAgent = req.headers["user-agent"] || null;
      const accountId = req.user?.accountId || null;

      const log = await adDisplayLogModel.createImpression({
        advertisementId,
        barPageId,
        accountId,
        displayType,
        ipAddress,
        userAgent
      });

      return res.json({ success: true, data: { logId: log.LogId } });
    } catch (error) {
      console.error("[AdController] trackImpression error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async trackClick(req, res) {
    try {
      const { logId } = req.body;
      if (!logId) {
        return res.status(400).json({ success: false, message: "logId is required" });
      }

      // Mark click trong AdDisplayLogs
      const updatedLog = await adDisplayLogModel.markClick(logId);

      if (!updatedLog) {
        return res.status(404).json({ success: false, message: "Log not found" });
      }

      // Nếu là dynamic ad, cập nhật click count
      if (updatedLog.DisplayType === 'dynamic_auction') {
        try {
          // Lấy thông tin ad từ log
          const adId = updatedLog.AdvertisementId;
          const clickUpdate = await adImpressionService.updateAdClicks(adId, 'dynamic');

          if (clickUpdate.success) {
            console.log(`[AdController] Updated dynamic ad clicks: ${JSON.stringify(clickUpdate)}`);
          } else {
            console.warn(`[AdController] Failed to update dynamic ad clicks:`, clickUpdate);
          }
        } catch (clickError) {
          console.error(`[AdController] Error updating click count:`, clickError);
          // Không fail request vì đã mark click thành công
        }
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("[AdController] trackClick error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async getDashboardStats(req, res) {
    try {
      const { barPageId } = req.params;
      const { startDate, endDate } = req.query;

      if (!barPageId) {
        return res.status(400).json({ success: false, message: "barPageId is required" });
      }

      const stats = await adDisplayLogModel.getStatsByBarPage(
        barPageId,
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );

      return res.json({ success: true, data: stats });
    } catch (error) {
      console.error("[AdController] getDashboardStats error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

    /**
   * Lấy quảng cáo từ Revive Ad Server
   */
    async getReviveAd(req, res) {
      try {
        const { zoneId, barPageId } = req.query;
        const zoneIdToUse = zoneId || process.env.REVIVE_NEWSFEED_ZONE_ID || "1";
        
        console.log(`[AdController] getReviveAd - Zone ID: ${zoneIdToUse}, BarPage ID: ${barPageId || 'none'}`);
        console.log(`[AdController] Revive URL: ${process.env.REVIVE_AD_SERVER_URL || "http://localhost/revive"}`);
  
        // Lấy banner từ Revive
        const banner = await reviveAdServerService.getBannerFromZone(zoneIdToUse, {
          source: 'newsfeed',
          barPageId: barPageId || ''
        });
  
        if (!banner || !banner.html) {
          console.warn(`[AdController] No banner returned from Revive for zone ${zoneIdToUse}`);
          return res.status(404).json({ 
            success: false, 
            message: "No banner available from Revive Ad Server. Please check: 1) Zone ID is correct, 2) Zone has active banners, 3) Campaign is active, 4) Revive server is running" 
          });
        }

        console.log(`[AdController] Banner retrieved successfully, HTML length: ${banner.html.length}`);
  
        return res.json({ 
          success: true, 
          data: {
            html: banner.html,
            zoneId: zoneIdToUse,
            type: 'revive'
          }
        });
      } catch (error) {
        console.error("[AdController] getReviveAd error:", error);
        return res.status(500).json({ 
          success: false, 
          message: error.message || "Failed to fetch banner from Revive Ad Server" 
        });
      }
    }
  
    /**
     * Lấy invocation code cho frontend
     */
    async getReviveInvocationCode(req, res) {
      try {
        const { zoneId } = req.query;
        const zoneIdToUse = zoneId || process.env.REVIVE_NEWSFEED_ZONE_ID || "1";
  
        const invocationCode = reviveAdServerService.getInvocationCode(zoneIdToUse);
  
        return res.json({ 
          success: true, 
          data: invocationCode
        });
      } catch (error) {
        console.error("[AdController] getReviveInvocationCode error:", error);
        return res.status(500).json({ success: false, message: error.message });
      }
    }

  /**
   * Lấy quảng cáo sau khi đấu giá (dynamic hoặc static)
   * GET /api/ads/auction?barPageId=xxx&zoneId=1
   */
  async getAdAfterAuction(req, res) {
    try {
      const { barPageId, zoneId = "1" } = req.query;
      const accountId = req.user?.id || req.user?.accountId;

      if (!barPageId) {
        return res.status(400).json({ success: false, message: "barPageId is required" });
      }

      // Thông tin context cho auction
      const context = {
        accountId,
        ipAddress: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
        timestamp: new Date(),
        zoneId
      };

      console.log(`[AdController] Running auction for BarPage ${barPageId}, context:`, context);

      // Chạy đấu giá
      const auctionResult = await adAuctionService.getAdAfterAuction(barPageId, zoneId, context);

      if (!auctionResult.ad) {
        console.log(`[AdController] No ad available after auction`);
        return res.status(404).json({
          success: false,
          message: "No advertisement available",
          auctionResult: auctionResult.auctionResult
        });
      }

      // Format data trả về frontend
      const formattedAd = adAuctionService.formatAdForFrontend(auctionResult);

      console.log(`[AdController] Auction completed. Type: ${auctionResult.type}, Score: ${auctionResult.score}`);

      return res.json({
        success: true,
        data: formattedAd,
        auctionResult: auctionResult.auctionResult
      });

    } catch (error) {
      console.error("[AdController] getAdAfterAuction error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy thống kê đấu giá (cho admin)
   * GET /api/ads/auction/stats?startDate=2024-01-01&endDate=2024-01-31
   */
  async getAuctionStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const stats = await adAuctionService.getAuctionStats(
        startDate ? new Date(startDate) : null,
        endDate ? new Date(endDate) : null
      );

      return res.json({ success: true, data: stats });
    } catch (error) {
      console.error("[AdController] getAuctionStats error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  // BAR PAGE FUNCTIONS - Quản lý quảng cáo của BarPage
  // ============================================================

  /**
   * BarPage tạo quảng cáo mới
   * POST /api/ads/create
   * Body: { barPageId, title, description, redirectUrl }
   * Files: image (upload)
   */
  async createUserAd(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { barPageId, title, description, redirectUrl } = req.body;
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      // Kiểm tra user có phải BarPage không
      const isBar = await userAdvertisementModel.isBarPage(accountId);
      if (!isBar) {
        return res.status(403).json({ 
          success: false, 
          message: "Chỉ quán bar mới có thể tạo quảng cáo" 
        });
      }
      
      // Verify barPageId thuộc về accountId
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== barPageId) {
        return res.status(403).json({ 
          success: false, 
          message: "BarPage không hợp lệ hoặc không thuộc về bạn" 
        });
      }
      
      if (!title || !redirectUrl) {
        return res.status(400).json({ 
          success: false, 
          message: "Title và redirectUrl là bắt buộc" 
        });
      }
      
      const imageUrl = req.files?.image?.[0]?.path || req.file?.path || req.body.imageUrl;
      if (!imageUrl) {
        return res.status(400).json({ 
          success: false, 
          message: "Image là bắt buộc" 
        });
      }
      
      // Tạo ad với status = 'pending'
      const ad = await userAdvertisementModel.createUserAd({
        barPageId,
        accountId,
        title,
        description,
        imageUrl,
        redirectUrl
      });
      
      // Gửi notification cho tất cả admin
      try {
        const pool = await getPool();
        const adminResult = await pool.request().query(`
          SELECT AccountId FROM Accounts WHERE Role IN ('admin', 'Admin')
        `);
        
        for (const admin of adminResult.recordset) {
          await notificationService.createNotification({
            type: "Confirm",
            sender: accountId,
            receiver: admin.AccountId,
            content: `Quán bar "${barPage.BarName}" đã tạo quảng cáo mới: "${title}" - Cần duyệt`,
            link: `/admin/ads/pending/${ad.UserAdId}`
          });
        }
      } catch (notifError) {
        console.warn("[AdController] Failed to send admin notification:", notifError);
      }
      
      return res.json({ 
        success: true, 
        data: ad,
        message: "Quảng cáo đã được tạo và đang chờ admin duyệt"
      });
    } catch (error) {
      console.error("[AdController] createUserAd error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy danh sách quảng cáo của BarPage
   * GET /api/ads/my-ads?barPageId=xxx
   */
  async getMyAds(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { barPageId } = req.query;
      
      if (!accountId || !barPageId) {
        return res.status(400).json({ success: false, message: "barPageId is required" });
      }
      
      // Verify barPageId thuộc về accountId
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== barPageId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      const ads = await userAdvertisementModel.getAdsByBarPage(barPageId);
      
      // Lấy purchases cho mỗi ad
      const adsWithPurchases = await Promise.all(
        ads.map(async (ad) => {
          const purchases = await adPurchaseModel.getPurchasesByUserAdId(ad.UserAdId);
          return { ...ad, purchases };
        })
      );
      
      return res.json({ success: true, data: adsWithPurchases });
    } catch (error) {
      console.error("[AdController] getMyAds error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy danh sách gói quảng cáo active (cho BarPage chọn)
   * GET /api/ads/packages
   */
  async getPackages(req, res) {
    try {
      const packages = await adPackageModel.getAllActivePackages();
      return res.json({ success: true, data: packages });
    } catch (error) {
      console.error("[AdController] getPackages error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Mua gói quảng cáo (sau khi ad đã được approve)
   * POST /api/ads/purchase
   * Body: { userAdId, packageId, price, impressions, packageName }
   */
  async purchasePackage(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { userAdId, packageId, price, impressions, packageName } = req.body;
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      if (!userAdId || !packageId || !price || !impressions || !packageName) {
        return res.status(400).json({ 
          success: false, 
          message: "userAdId, packageId, price, impressions, packageName are required" 
        });
      }
      
      // Kiểm tra ad thuộc về BarPage và đã được approve
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad || ad.AccountId !== accountId) {
        return res.status(403).json({ 
          success: false, 
          message: "Ad not found or access denied" 
        });
      }
      
      if (ad.Status !== 'approved') {
        return res.status(400).json({ 
          success: false, 
          message: `Quảng cáo phải được duyệt trước khi mua gói. Trạng thái hiện tại: ${ad.Status}` 
        });
      }
      
      // Lấy thông tin package để lấy packageCode
      const pkg = await adPackageModel.findById(packageId);
      if (!pkg || !pkg.IsActive) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid or inactive package" 
        });
      }
      
      // Validate price
      if (parseFloat(price) !== parseFloat(pkg.Price)) {
        return res.status(400).json({ 
          success: false, 
          message: "Package price mismatch" 
        });
      }
      
      // TODO: Integrate với payment gateway (PayOS)
      // Giả sử payment thành công, tạo payment history
      
      // 1. Tạo payment history
      const paymentHistory = await paymentHistoryModel.createPaymentHistory({
        type: 'ad_package',
        senderId: accountId,
        receiverId: null,
        transferContent: `Mua gói quảng cáo: ${packageName} (${parseInt(impressions).toLocaleString()} lượt xem) cho quảng cáo "${ad.Title}"`,
        transferAmount: parseFloat(price)
      });
      
      // 2. Tạo purchase record
      const purchase = await adPurchaseModel.createPurchase({
        userAdId,
        packageId,
        barPageId: ad.BarPageId,
        accountId,
        packageName,
        packageCode: pkg.PackageCode,
        impressions: parseInt(impressions),
        price: parseFloat(price),
        paymentHistoryId: paymentHistory.PaymentHistoryId,
        paymentMethod: 'payos', // Hoặc method khác
        paymentId: `order_${Date.now()}` // Order code từ payment gateway
      });
      
      // 3. Update purchase status -> paid -> active
      await adPurchaseModel.updatePurchaseStatus(purchase.PurchaseId, 'active', 'paid');
      
      // 4. Update ad: thêm impressions và activate
      const newRemainingImpressions = (ad.RemainingImpressions || 0) + parseInt(impressions);
      await userAdvertisementModel.updateAdStatus(userAdId, {
        status: 'active',
        remainingImpressions: newRemainingImpressions,
        totalImpressions: (ad.TotalImpressions || 0) + parseInt(impressions)
      });
      
      // 5. Update package stats (SoldCount, TotalRevenue)
      await adPackageModel.updatePackageStats(packageId, parseFloat(price), 'increment');
      
      // 6. Update total spent của ad
      const pool = await getPool();
      await pool.request()
        .input("UserAdId", sql.UniqueIdentifier, userAdId)
        .input("Price", sql.Decimal(18,2), parseFloat(price))
        .query(`
          UPDATE UserAdvertisements
          SET TotalSpent = TotalSpent + @Price
          WHERE UserAdId = @UserAdId
        `);
      
      return res.json({ 
        success: true, 
        data: { purchase, paymentHistory },
        message: "Gói quảng cáo đã được mua thành công" 
      });
    } catch (error) {
      console.error("[AdController] purchasePackage error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Dashboard stats cho BarPage
   * GET /api/ads/dashboard/:barPageId
   */
  async getBarDashboardStats(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { barPageId } = req.params;
      
      if (!accountId || !barPageId) {
        return res.status(400).json({ success: false, message: "barPageId is required" });
      }
      
      // Verify ownership
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== barPageId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Lấy stats từ UserAdvertisements
      const pool = await getPool();
      const statsResult = await pool.request()
        .input("BarPageId", sql.UniqueIdentifier, barPageId)
        .query(`
          SELECT 
            COUNT(*) AS TotalAds,
            SUM(TotalImpressions) AS TotalImpressions,
            SUM(TotalClicks) AS TotalClicks,
            SUM(TotalSpent) AS TotalSpent,
            SUM(RemainingImpressions) AS RemainingImpressions,
            SUM(CASE WHEN Status = 'active' THEN 1 ELSE 0 END) AS ActiveAds,
            SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) AS PendingAds,
            SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedAds
          FROM UserAdvertisements
          WHERE BarPageId = @BarPageId
        `);
      
      const stats = statsResult.recordset[0] || {
        TotalAds: 0,
        TotalImpressions: 0,
        TotalClicks: 0,
        TotalSpent: 0,
        RemainingImpressions: 0,
        ActiveAds: 0,
        PendingAds: 0,
        ApprovedAds: 0
      };
      
      // Tính CTR
      const ctr = stats.TotalImpressions > 0 
        ? (stats.TotalClicks / stats.TotalImpressions * 100).toFixed(2)
        : 0;
      
      return res.json({
        success: true,
        data: {
          ...stats,
          CTR: parseFloat(ctr)
        }
      });
    } catch (error) {
      console.error("[AdController] getBarDashboardStats error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Track impression cho dynamic ad (khi ad thực sự được hiển thị)
   * POST /api/ads/track/dynamic-impression
   */
  async trackDynamicImpression(req, res) {
    try {
      const { userAdId, barPageId } = req.body;

      if (!userAdId || !barPageId) {
        return res.status(400).json({
          success: false,
          message: "userAdId and barPageId are required"
        });
      }

      // Cập nhật impression count
      const result = await adImpressionService.updateDynamicAdImpressions(userAdId, barPageId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.reason || result.error || "Failed to track impression"
        });
      }

      return res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error("[AdController] trackDynamicImpression error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

}

module.exports = new AdController();