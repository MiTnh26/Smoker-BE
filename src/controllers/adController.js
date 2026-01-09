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
const entityAccountModel = require("../models/entityAccountModel");
const adAuctionService = require("../services/adAuctionService");
const adImpressionService = require("../services/adImpressionService");
const payosService = require("../services/payosService");
const adPauseRequestModel = require("../models/adPauseRequestModel");
const adResumeRequestModel = require("../models/adResumeRequestModel");
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
  
        // Lấy banner HTML từ Revive
        let bannerHtml = "";
        
        try {
          const banner = await reviveAdServerService.getBannerFromZone(zoneIdToUse, {
            source: 'newsfeed',
            barPageId: barPageId || ''
          });
          
          if (banner && banner.html) {
            bannerHtml = banner.html;
            // Replace localhost URLs với production URL (đảm bảo double-check)
            bannerHtml = reviveAdServerService.replaceLocalhostUrls(bannerHtml);
            // Convert /bar/{BarPageId} URLs to /profile/{EntityAccountId}
            bannerHtml = await reviveAdServerService.convertBarUrlsInHtml(bannerHtml);
            console.log(`[AdController] Successfully retrieved banner HTML (${bannerHtml.length} chars)`);
          } else {
            console.warn(`[AdController] No banner HTML returned from Revive for zone ${zoneIdToUse}`);
            console.warn(`[AdController] This could mean:`);
            console.warn(`  1. Zone ${zoneIdToUse} has no active banners`);
            console.warn(`  2. Campaign is not active or expired`);
            console.warn(`  3. Revive server is not responding correctly`);
            console.warn(`  4. Check Revive Admin Panel: Inventory → Zones → Zone ${zoneIdToUse}`);
          }
        } catch (reviveError) {
          console.error(`[AdController] Failed to get banner from Revive:`, {
            message: reviveError.message,
            stack: reviveError.stack,
            zoneId: zoneIdToUse
          });
        }

        // Nếu không có banner HTML, trả về lỗi
        if (!bannerHtml) {
          return res.status(404).json({ 
            success: false, 
            message: "No ad available. Please check: 1) Zone ID is correct, 2) Zone has active banners, 3) Campaign is active, 4) Revive server is running" 
          });
        }

        return res.json({
          success: true,
          message: "Ad fetched successfully",
          adHtml: bannerHtml
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
   * Lấy danh sách quảng cáo của BarPage (bao gồm cả event-based ads)
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
          return { ...ad, purchases, source: 'direct' }; // Direct ads (tạo trực tiếp)
        })
      );
      
      return res.json({ success: true, data: adsWithPurchases });
    } catch (error) {
      console.error("[AdController] getMyAds error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy purchases của một Event (để xem tiến trình quảng cáo)
   * GET /api/ads/event-purchases/:eventId
   */
  async getEventPurchases(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { eventId } = req.params;
      
      if (!accountId || !eventId) {
        return res.status(400).json({ success: false, message: "eventId is required" });
      }
      
      // Verify Event thuộc về user
      const eventModel = require("../models/eventModel");
      const event = await eventModel.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found" });
      }
      
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== event.BarPageId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      const purchases = await adPurchaseModel.getPurchasesByEventId(eventId);
      
      // Lấy thông tin UserAdvertisement nếu đã được approve
      const purchasesWithAds = await Promise.all(
        purchases.map(async (purchase) => {
          if (purchase.UserAdId) {
            const userAd = await userAdvertisementModel.findById(purchase.UserAdId);
            return { ...purchase, userAd };
          }
          return purchase;
        })
      );
      
      return res.json({ 
        success: true, 
        data: {
          event,
          purchases: purchasesWithAds
        }
      });
    } catch (error) {
      console.error("[AdController] getEventPurchases error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy thông tin purchase theo ID (cho payment return page)
   * GET /api/ads/purchases/:purchaseId
   * Query params: code, status, orderCode (từ PayOS return URL)
   */
  async getPurchaseById(req, res) {
    try {
      // Log ngay từ đầu để đảm bảo function được gọi
      console.log("=".repeat(80));
      console.log("[AdController] ========== getPurchaseById STARTED ==========");
      console.log("[AdController] Request params:", req.params);
      console.log("[AdController] Request query:", req.query);
      console.log("[AdController] Request user:", req.user);
      
      const accountId = req.user?.id || req.user?.accountId;
      const { purchaseId } = req.params;
      const { code, status: paymentStatus, orderCode } = req.query;
      
      console.log("[AdController] Extracted values:", {
        purchaseId,
        code,
        paymentStatus,
        orderCode,
        accountId
      });
      
      if (!accountId || !purchaseId) {
        return res.status(400).json({ success: false, message: "purchaseId is required" });
      }
      
      const purchase = await adPurchaseModel.findById(purchaseId);
      if (!purchase) {
        return res.status(404).json({ success: false, message: "Purchase not found" });
      }
      
      console.log("[AdController] Purchase found:", {
        purchaseId: purchase.PurchaseId,
        currentPaymentStatus: purchase.PaymentStatus,
        currentStatus: purchase.Status,
        paymentId: purchase.PaymentId
      });
      
      // Verify purchase thuộc về user
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== purchase.BarPageId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Nếu có payment params từ PayOS và payment chưa được confirm
      // Thì cập nhật payment status ngay (fallback nếu webhook chưa đến)
      // Kiểm tra cả code và status (case-insensitive)
      const isPaymentSuccess = (code === '00' || code === '0') && 
                               (paymentStatus === 'PAID' || paymentStatus === 'paid' || paymentStatus === 'Paid');
      
      console.log("[AdController] ========== Payment Status Check ==========");
      console.log("[AdController] Payment check:", {
        isPaymentSuccess,
        code,
        paymentStatus,
        currentPaymentStatus: purchase.PaymentStatus,
        shouldUpdate: isPaymentSuccess && purchase.PaymentStatus !== 'paid',
        codeCheck: code === '00' || code === '0',
        statusCheck: paymentStatus === 'PAID' || paymentStatus === 'paid' || paymentStatus === 'Paid'
      });
      
      if (isPaymentSuccess && purchase.PaymentStatus !== 'paid') {
        console.log("[AdController] ========== ENTERING UPDATE BLOCK ==========");
        console.log("[AdController] Updating payment status from return URL (webhook may be delayed):", {
          purchaseId,
          currentPaymentStatus: purchase.PaymentStatus,
          code,
          paymentStatus,
          orderCode,
          purchasePaymentId: purchase.PaymentId
        });
        
        try {
          console.log("[AdController] ========== STARTING UPDATE PROCESS ==========");
          
          // Verify orderCode khớp với PaymentId (nếu có orderCode)
          // Nếu không có orderCode, vẫn update vì đã có code=00 và status=PAID từ PayOS
          const orderCodeMatches = !orderCode || purchase.PaymentId === orderCode.toString();
          
          if (!orderCodeMatches) {
            console.warn("[AdController] OrderCode mismatch:", {
              orderCodeFromUrl: orderCode,
              purchasePaymentId: purchase.PaymentId
            });
            // Vẫn update vì code=00 và status=PAID đã confirm thanh toán thành công
          }
          
          console.log("[AdController] Step 1: Getting database pool...");
          // Update trực tiếp bằng SQL để đảm bảo update được
          const pool = await getPool();
          console.log("[AdController] Step 1: Database pool obtained");
          
          console.log("[AdController] Step 2: Executing UPDATE query...");
          const updateResult = await pool.request()
            .input("PurchaseId", sql.UniqueIdentifier, purchase.PurchaseId)
            .query(`
              UPDATE AdPurchases
              SET PaymentStatus = 'paid',
                  Status = 'pending'
              WHERE PurchaseId = @PurchaseId
            `);
          
          console.log("[AdController] Step 2: Direct SQL update executed. Rows affected:", updateResult.rowsAffected);
          
          console.log("[AdController] Step 3: Verifying update...");
          // Verify update thành công - Query lại để check
          const verifyResult = await pool.request()
            .input("PurchaseId", sql.UniqueIdentifier, purchase.PurchaseId)
            .query(`
              SELECT PaymentStatus, Status
              FROM AdPurchases
              WHERE PurchaseId = @PurchaseId
            `);
          
          const verifiedStatus = verifyResult.recordset[0]?.PaymentStatus;
          console.log("[AdController] Step 3: Verified PaymentStatus after update:", verifiedStatus);
          
          if (verifiedStatus !== 'paid') {
            console.error("[AdController] ❌ Update STILL failed - PaymentStatus still not 'paid':", verifiedStatus);
            console.error("[AdController] PurchaseId:", purchase.PurchaseId);
            console.error("[AdController] Current record:", verifyResult.recordset[0]);
            // Throw error để frontend biết
            throw new Error(`Failed to update PaymentStatus to 'paid'. Current status: ${verifiedStatus}`);
          } else {
            console.log("[AdController] ✅ Step 3: PaymentStatus successfully updated to 'paid'");
          }
          
          // Cũng gọi updatePurchaseStatus để đảm bảo consistency
          console.log("[AdController] Step 3b: Calling updatePurchaseStatus model method...");
          const updatedPurchase = await adPurchaseModel.updatePurchaseStatus(purchase.PurchaseId, 'pending', 'paid');
          console.log("[AdController] Step 3b: updatePurchaseStatus model method called. Result:", {
            purchaseId: updatedPurchase?.PurchaseId,
            paymentStatus: updatedPurchase?.PaymentStatus,
            status: updatedPurchase?.Status
          });
          
          // Tạo PaymentHistory nếu chưa có
          console.log("[AdController] Step 4: Checking PaymentHistoryId...");
          console.log("[AdController] Current PaymentHistoryId:", purchase.PaymentHistoryId);
          
          try {
            if (!purchase.PaymentHistoryId) {
              console.log("[AdController] ========== CREATING PAYMENT HISTORY ==========");
              
              // Lấy BarPage để lấy EntityAccountId
              const barPage = await barPageModel.getBarPageById(purchase.BarPageId);
              if (!barPage || !barPage.EntityAccountId) {
                console.error("[AdController] ❌ BarPage or EntityAccountId not found for BarPageId:", purchase.BarPageId);
                console.error("[AdController] Cannot create PaymentHistory without EntityAccountId");
              } else {
                const entityAccountId = barPage.EntityAccountId;
                console.log("[AdController] EntityAccountId from BarPage:", entityAccountId);
                
                console.log("[AdController] Creating PaymentHistory record...");
                const paymentHistoryData = {
                  type: 'ad_package',
                  senderId: entityAccountId,
                  receiverId: null,
                  transferContent: `Mua gói quảng cáo: ${purchase.PackageName} (${parseInt(purchase.Impressions).toLocaleString()} lượt xem)`,
                  transferAmount: parseFloat(purchase.Price)
                };
                console.log("[AdController] PaymentHistory data:", JSON.stringify(paymentHistoryData, null, 2));
                
                const paymentHistory = await paymentHistoryModel.createPaymentHistory(paymentHistoryData);
                
                console.log("[AdController] ✅ PaymentHistory created successfully:", paymentHistory?.PaymentHistoryId);
                console.log("[AdController] Full PaymentHistory record:", JSON.stringify(paymentHistory, null, 2));
                
                // Update PaymentHistoryId
                console.log("[AdController] Updating PaymentHistoryId in AdPurchases...");
                const updatePool = await getPool();
                const updatePhResult = await updatePool.request()
                  .input("PurchaseId", sql.UniqueIdentifier, purchase.PurchaseId)
                  .input("PaymentHistoryId", sql.UniqueIdentifier, paymentHistory.PaymentHistoryId)
                  .query(`
                    UPDATE AdPurchases
                    SET PaymentHistoryId = @PaymentHistoryId
                    WHERE PurchaseId = @PurchaseId
                  `);
                console.log("[AdController] PaymentHistoryId update executed. Rows affected:", updatePhResult.rowsAffected);
                
                // Verify
                const verifyPh = await updatePool.request()
                  .input("PurchaseId", sql.UniqueIdentifier, purchase.PurchaseId)
                  .query(`
                    SELECT PaymentHistoryId FROM AdPurchases WHERE PurchaseId = @PurchaseId
                  `);
                console.log("[AdController] Verified PaymentHistoryId:", verifyPh.recordset[0]?.PaymentHistoryId);
              }
            } else {
              console.log("[AdController] PaymentHistoryId already exists:", purchase.PaymentHistoryId);
            }
          } catch (phError) {
            console.error("[AdController] ========== ERROR CREATING PAYMENT HISTORY ==========");
            console.error("[AdController] PaymentHistory creation error:", phError);
            console.error("[AdController] Error message:", phError.message);
            console.error("[AdController] Error stack:", phError.stack);
            console.error("[AdController] ====================================================");
            // Không throw error để không làm gián đoạn việc update PaymentStatus
            // PaymentHistory có thể được tạo lại sau
          }
          
          // Update package stats
          console.log("[AdController] Updating package stats...");
          await adPackageModel.updatePackageStats(purchase.PackageId, parseFloat(purchase.Price), 'increment');
          console.log("[AdController] Package stats updated");
          
          // Gửi notification cho admin (nếu chưa có)
          // Note: Có thể duplicate nếu webhook cũng gửi, nhưng notification service nên handle idempotent
          try {
            const eventModel = require("../models/eventModel");
            const notificationService = require("../services/notificationService");
            const event = purchase.EventId ? await eventModel.getEventById(purchase.EventId) : null;
            const barPage = await barPageModel.getBarPageById(purchase.BarPageId);
            
            const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
            const barUrl = `${frontendUrl}/bar/${barPage.BarPageId}`;
            
            const pool = await getPool();
            const adminResult = await pool.request().query(`
              SELECT AccountId FROM Accounts WHERE Role IN ('admin', 'Admin')
            `);
            
            const notificationContent = [
              `Quán bar "${barPage.BarName}" đã thanh toán gói quảng cáo cho event "${event?.EventName || 'N/A'}".`,
              `Cần set lên Revive và approve.`,
              ``,
              `Thông tin Event:`,
              `- Title: ${event?.EventName || 'N/A'}`,
              `- Description: ${event?.Description || 'Không có mô tả'}`,
              `- Picture: ${event?.Picture || 'Không có ảnh'}`,
              `- Bar ID: ${barPage.BarPageId}`,
              `- Bar URL: ${barUrl}`,
              `- Event ID: ${purchase.EventId || 'N/A'}`,
              `- Package: ${purchase.PackageName} (${parseInt(purchase.Impressions).toLocaleString()} lượt xem) - ${parseFloat(purchase.Price).toLocaleString('vi-VN')} VND`
            ].join('\n');
            
            // Lấy AccountId từ BarPage để gửi notification
            const barPageForNotif = await barPageModel.getBarPageById(purchase.BarPageId);
            const senderAccountId = barPageForNotif?.AccountId;
            
            for (const admin of adminResult.recordset) {
              await notificationService.createNotification({
                type: "Confirm",
                sender: senderAccountId || purchase.BarPageId, // Fallback to BarPageId nếu không có AccountId
                receiver: admin.AccountId,
                content: notificationContent,
                link: `/admin/ads/event-purchases/pending/${purchase.PurchaseId}`
              });
            }
            console.log("[AdController] Notifications sent to", adminResult.recordset.length, "admins");
          } catch (notifError) {
            console.warn("[AdController] Failed to send admin notification:", notifError);
          }
          
          // Lấy lại purchase đã update
          console.log("[AdController] Step 6: Fetching final purchase data...");
          const finalPurchase = await adPurchaseModel.findById(purchaseId);
          console.log("[AdController] ========== FINAL PURCHASE STATUS ==========");
          console.log("[AdController] Final purchase status:", {
            purchaseId: finalPurchase?.PurchaseId,
            paymentStatus: finalPurchase?.PaymentStatus,
            status: finalPurchase?.Status,
            paymentHistoryId: finalPurchase?.PaymentHistoryId
          });
          console.log("[AdController] ========== UPDATE PROCESS COMPLETED ==========");
          
          return res.json({ 
            success: true, 
            data: finalPurchase,
            message: "Payment status updated from return URL"
          });
        } catch (updateError) {
          console.error("[AdController] ========== ERROR IN UPDATE PROCESS ==========");
          console.error("[AdController] Error updating payment status from return URL:", updateError);
          console.error("[AdController] Error message:", updateError.message);
          console.error("[AdController] Error stack:", updateError.stack);
          console.error("[AdController] PurchaseId:", purchaseId);
          console.error("[AdController] ============================================");
          // Vẫn trả về purchase hiện tại nếu update fail
        }
      } else {
        console.log("[AdController] ========== SKIPPING UPDATE ==========");
        console.log("[AdController] Reason:", {
          isPaymentSuccess,
          currentPaymentStatus: purchase.PaymentStatus,
          alreadyPaid: purchase.PaymentStatus === 'paid'
        });
      }
      
      console.log("[AdController] ========== getPurchaseById COMPLETED ==========");
      console.log("=".repeat(80));
      
      // Return purchase (có thể đã được update hoặc chưa)
      const returnPurchase = await adPurchaseModel.findById(purchaseId);
      return res.json({ 
        success: true, 
        data: returnPurchase
      });
    } catch (error) {
      console.error("[AdController] ========== ERROR IN getPurchaseById ==========");
      console.error("[AdController] Error:", error);
      console.error("[AdController] Error message:", error.message);
      console.error("[AdController] Error stack:", error.stack);
      console.error("[AdController] ==============================================");
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
   * Mua gói quảng cáo cho Event
   * POST /api/ads/purchase
   * Body: { eventId, packageId, price, impressions, packageName }
   * 
   * Luồng mới:
   * 1. BarPage tạo Event
   * 2. Chọn gói quảng cáo cho Event
   * 3. Thanh toán
   * 4. Gửi notification cho admin với thông tin Event
   * 5. Admin set lên Revive và approve
   */
  async purchasePackage(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { eventId, packageId, price, impressions, packageName } = req.body;
      
      if (!accountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      if (!eventId || !packageId || !price || !impressions || !packageName) {
        return res.status(400).json({ 
          success: false, 
          message: "eventId, packageId, price, impressions, packageName are required" 
        });
      }
      
      // Lấy thông tin Event
      const eventModel = require("../models/eventModel");
      const event = await eventModel.getEventById(eventId);
      if (!event) {
        return res.status(404).json({ 
          success: false, 
          message: "Event not found" 
        });
      }
      
      // Verify Event thuộc về BarPage của user
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== event.BarPageId) {
        return res.status(403).json({ 
          success: false, 
          message: "Event not found or access denied" 
        });
      }
      
      // Lấy thông tin package
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
      
      // Lấy ManagerId mặc định (admin manager) hoặc NULL nếu không có
      // ManagerId có thể NULL trong AdPurchases nếu không bắt buộc
      let managerId = null;
      try {
        const { getPool, sql } = require("../db/sqlserver");
        const pool = await getPool();
        const managerResult = await pool.request().query(`
          SELECT TOP 1 ManagerId FROM Managers WHERE Role IN ('Admin', 'admin') ORDER BY CreatedAt ASC
        `);
        if (managerResult.recordset.length > 0) {
          managerId = managerResult.recordset[0].ManagerId;
        }
      } catch (managerError) {
        console.warn("[AdController] Could not get default ManagerId, using NULL:", managerError.message);
        managerId = null;
      }
      
      // Tạo purchase record với status 'pending' và paymentStatus 'pending'
      const orderCode = Date.now(); // Tạo orderCode unique từ timestamp
      const purchase = await adPurchaseModel.createPurchase({
        eventId,
        userAdId: null,
        packageId,
        barPageId: event.BarPageId,
        managerId: managerId, // Sử dụng ManagerId mặc định hoặc NULL
        packageName,
        packageCode: pkg.PackageCode,
        impressions: parseInt(impressions),
        price: parseFloat(price),
        paymentHistoryId: null, // Sẽ được set sau khi payment thành công qua webhook
        paymentMethod: 'payos',
        paymentId: orderCode.toString() // Lưu orderCode vào PaymentId
      });
      
      // Tạo PayOS payment link
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const returnUrl = `${frontendUrl}/payment-return?type=ad-purchase&purchaseId=${purchase.PurchaseId}`;
      const cancelUrl = `${frontendUrl}/payment-cancel?type=ad-purchase&purchaseId=${purchase.PurchaseId}`;
      
      // PayOS description tối đa 25 ký tự, chỉ dùng tên gói
      const description = packageName.length > 25 ? packageName.substring(0, 22) + '...' : packageName;
      
      const paymentData = {
        amount: parseInt(parseFloat(price)), // PayOS cần số nguyên (VND)
        orderCode: orderCode,
        description: description,
        returnUrl: returnUrl,
        cancelUrl: cancelUrl
      };
      
      const payosResult = await payosService.createPayment(paymentData);
      
      return res.json({ 
        success: true, 
        data: { 
          purchase,
          paymentUrl: payosResult.paymentUrl,
          orderCode: payosResult.orderCode
        },
        message: "Payment link created successfully" 
      });
    } catch (error) {
      console.error("[AdController] purchasePackage error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Dashboard stats cho BarPage (Overview)
   * GET /api/ads/bar-dashboard/:barPageId
   */
  async getBarDashboardStats(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { barPageId } = req.params;
      const { startDate, endDate } = req.query; // Optional date range
      
      console.log("[AdController] getBarDashboardStats called:", {
        accountId,
        barPageId,
        barPageIdType: typeof barPageId,
        barPageIdLength: barPageId?.length
      });
      
      if (!accountId || !barPageId) {
        return res.status(400).json({ 
          success: false, 
          message: "barPageId is required",
          received: { accountId, barPageId }
        });
      }
      
      // Validate GUID format
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidRegex.test(barPageId)) {
        console.error("[AdController] Invalid GUID format:", barPageId);
        return res.status(400).json({ 
          success: false, 
          message: "Validation failed for parameter 'BarPageId'. Invalid GUID.",
          received: barPageId
        });
      }
      
      // Verify ownership
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== barPageId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      
      // Lấy stats từ UserAdvertisements (kết hợp với data từ Revive đã sync)
      const pool = await getPool();
      
      // Build date filter if provided
      let dateFilter = "";
      const request = pool.request()
        .input("BarPageId", sql.UniqueIdentifier, barPageId);
      
      if (startDate) {
        request.input("StartDate", sql.DateTime2, new Date(startDate));
        dateFilter += " AND ua.UpdatedAt >= @StartDate";
      }
      if (endDate) {
        request.input("EndDate", sql.DateTime2, new Date(endDate));
        dateFilter += " AND ua.UpdatedAt <= @EndDate";
      }
      
      // Overview stats
      // Tính RemainingImpressions = PackageImpressions - TotalImpressions
      const statsResult = await request.query(`
        SELECT 
          COUNT(*) AS TotalAds,
          SUM(COALESCE(ua.TotalImpressions, 0)) AS TotalImpressions,
          SUM(COALESCE(ua.TotalClicks, 0)) AS TotalClicks,
          SUM(COALESCE(ua.TotalSpent, 0)) AS TotalSpent,
          SUM(
            CASE 
              WHEN ap.Impressions IS NOT NULL AND ap.Impressions > 0
              THEN CASE 
                WHEN (ap.Impressions - COALESCE(ua.TotalImpressions, 0)) > 0
                THEN (ap.Impressions - COALESCE(ua.TotalImpressions, 0))
                ELSE 0
              END
              ELSE 0
            END
          ) AS RemainingImpressions,
          SUM(CASE WHEN ua.Status = 'active' THEN 1 ELSE 0 END) AS ActiveAds,
          SUM(CASE WHEN ua.Status = 'pending' THEN 1 ELSE 0 END) AS PendingAds,
          SUM(CASE WHEN ua.Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedAds
        FROM UserAdvertisements ua
        LEFT JOIN AdPurchases ap ON ua.UserAdId = ap.UserAdId AND ap.Status = 'active'
        WHERE ua.BarPageId = @BarPageId ${dateFilter}
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
      
      // Lấy danh sách ads với stats chi tiết
      const adsResult = await pool.request()
        .input("BarPageId", sql.UniqueIdentifier, barPageId)
        .query(`
          SELECT 
            ua.UserAdId,
            ua.Title,
            ua.ImageUrl,
            ua.Status,
            ua.ReviveBannerId,
            ua.ReviveCampaignId,
            ua.ReviveZoneId,
            ua.TotalImpressions,
            ua.TotalClicks,
            ua.TotalSpent,
            ua.RemainingImpressions,
            ua.CreatedAt,
            ua.UpdatedAt,
            CASE 
              WHEN ua.TotalImpressions > 0 
              THEN CAST((ua.TotalClicks * 100.0 / ua.TotalImpressions) AS DECIMAL(10, 2))
              ELSE 0 
            END AS CTR,
            ap.PackageName,
            ap.Impressions AS PackageImpressions,
            ap.Price AS PackagePrice,
            -- Tính RemainingImpressions = PackageImpressions - TotalImpressions
            CASE 
              WHEN ap.Impressions IS NOT NULL AND ap.Impressions > 0
              THEN CASE 
                WHEN (ap.Impressions - COALESCE(ua.TotalImpressions, 0)) > 0
                THEN (ap.Impressions - COALESCE(ua.TotalImpressions, 0))
                ELSE 0
              END
              ELSE 0
            END AS CalculatedRemainingImpressions
          FROM UserAdvertisements ua
          LEFT JOIN AdPurchases ap ON ua.UserAdId = ap.UserAdId AND ap.Status = 'active'
          WHERE ua.BarPageId = @BarPageId
          ORDER BY ua.CreatedAt DESC
        `);
      
      return res.json({
        success: true,
        data: {
          overview: {
            ...stats,
            CTR: parseFloat(ctr)
          },
          ads: adsResult.recordset.map(ad => ({
            userAdId: ad.UserAdId,
            title: ad.Title,
            imageUrl: ad.ImageUrl,
            status: ad.Status,
            reviveBannerId: ad.ReviveBannerId,
            reviveCampaignId: ad.ReviveCampaignId,
            reviveZoneId: ad.ReviveZoneId,
            impressions: ad.TotalImpressions || 0,
            clicks: ad.TotalClicks || 0,
            spent: ad.TotalSpent || 0,
            remainingImpressions: ad.CalculatedRemainingImpressions || 0, // Dùng calculated value
            ctr: ad.CTR || 0,
            packageName: ad.PackageName,
            packageImpressions: ad.PackageImpressions || 0,
            packagePrice: ad.PackagePrice,
            createdAt: ad.CreatedAt,
            updatedAt: ad.UpdatedAt
          }))
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

  /**
   * BarPage tạo yêu cầu tạm dừng quảng cáo
   * POST /api/ads/pause-request
   */
  async createPauseRequest(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { userAdId, reason, requestNote } = req.body;
      
      if (!userAdId) {
        return res.status(400).json({ 
          success: false, 
          message: "userAdId is required" 
        });
      }
      
      // Kiểm tra quyền sở hữu
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        return res.status(404).json({ 
          success: false, 
          message: "Ad not found" 
        });
      }
      
      // Verify ownership
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== ad.BarPageId) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied" 
        });
      }
      
      // Kiểm tra ad có đang active không
      if (ad.Status !== 'active') {
        return res.status(400).json({ 
          success: false, 
          message: `Không thể tạm dừng quảng cáo có trạng thái: ${ad.Status}` 
        });
      }
      
      // Kiểm tra đã có request pending chưa
      const hasPending = await adPauseRequestModel.hasPendingRequest(userAdId);
      if (hasPending) {
        return res.status(400).json({ 
          success: false, 
          message: "Đã có yêu cầu tạm dừng đang chờ duyệt" 
        });
      }
      
      // Tạo pause request
      const pauseRequest = await adPauseRequestModel.createPauseRequest({
        userAdId,
        barPageId: ad.BarPageId,
        accountId,
        reason,
        requestNote
      });
      
      // Gửi notification cho admin
      try {
        // Tìm admin account (giả sử có role admin)
        const pool = await getPool();
        const adminResult = await pool.request().query(`
          SELECT TOP 1 AccountId 
          FROM Accounts 
          WHERE Role = 'Admin'
          ORDER BY CreatedAt ASC
        `);
        
        if (adminResult.recordset.length > 0) {
          const adminAccountId = adminResult.recordset[0].AccountId;
          await notificationService.createNotification({
            type: "Info",
            sender: accountId,
            receiver: adminAccountId,
            content: `Yêu cầu tạm dừng quảng cáo từ ${barPage.BarName}: ${ad.Title}`,
            link: `/admin/ads/pause-requests/${pauseRequest.PauseRequestId}`
          });
        }
      } catch (notifError) {
        console.warn("[AdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tạm dừng đã được gửi thành công",
        data: pauseRequest
      });
      
    } catch (error) {
      console.error("[AdController] createPauseRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * BarPage xem danh sách yêu cầu pause của mình
   * GET /api/ads/pause-requests
   */
  async getMyPauseRequests(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      
      // Verify BarPage
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied" 
        });
      }
      
      const pauseRequests = await adPauseRequestModel.getByBarPageId(barPage.BarPageId);
      
      return res.json({
        success: true,
        data: pauseRequests
      });
      
    } catch (error) {
      console.error("[AdController] getMyPauseRequests error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * BarPage tạo yêu cầu tiếp tục quảng cáo
   * POST /api/ads/resume-request
   */
  async createResumeRequest(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      const { userAdId, reason, requestNote } = req.body;
      
      if (!userAdId) {
        return res.status(400).json({ 
          success: false, 
          message: "userAdId is required" 
        });
      }
      
      // Kiểm tra quyền sở hữu
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        return res.status(404).json({ 
          success: false, 
          message: "Ad not found" 
        });
      }
      
      // Verify ownership
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage || barPage.BarPageId !== ad.BarPageId) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied" 
        });
      }
      
      // Kiểm tra ad có đang paused không
      if (ad.Status !== 'paused') {
        return res.status(400).json({ 
          success: false, 
          message: `Không thể tiếp tục quảng cáo có trạng thái: ${ad.Status}` 
        });
      }
      
      // Kiểm tra đã có request pending chưa
      const hasPending = await adResumeRequestModel.hasPendingRequest(userAdId);
      if (hasPending) {
        return res.status(400).json({ 
          success: false, 
          message: "Đã có yêu cầu tiếp tục đang chờ duyệt" 
        });
      }
      
      // Tạo resume request
      const resumeRequest = await adResumeRequestModel.createResumeRequest({
        userAdId,
        barPageId: ad.BarPageId,
        accountId,
        reason,
        requestNote
      });
      
      // Gửi notification cho admin
      try {
        // Tìm admin account (giả sử có role admin)
        const pool = await getPool();
        const adminResult = await pool.request().query(`
          SELECT TOP 1 AccountId 
          FROM Accounts 
          WHERE Role = 'Admin'
          ORDER BY CreatedAt ASC
        `);
        
        if (adminResult.recordset.length > 0) {
          const adminAccountId = adminResult.recordset[0].AccountId;
          await notificationService.createNotification({
            type: "Info",
            sender: accountId,
            receiver: adminAccountId,
            content: `Yêu cầu tiếp tục quảng cáo từ ${barPage.BarName}: ${ad.Title}`,
            link: `/admin/ads/resume-requests/${resumeRequest.ResumeRequestId}`
          });
        }
      } catch (notifError) {
        console.warn("[AdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tiếp tục đã được gửi thành công",
        data: resumeRequest
      });
      
    } catch (error) {
      console.error("[AdController] createResumeRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * BarPage xem danh sách yêu cầu resume của mình
   * GET /api/ads/resume-requests
   */
  async getMyResumeRequests(req, res) {
    try {
      const accountId = req.user?.id || req.user?.accountId;
      
      // Verify BarPage
      const barPage = await barPageModel.getBarPageByAccountId(accountId);
      if (!barPage) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied" 
        });
      }
      
      const resumeRequests = await adResumeRequestModel.getByBarPageId(barPage.BarPageId);
      
      return res.json({
        success: true,
        data: resumeRequests
      });
      
    } catch (error) {
      console.error("[AdController] getMyResumeRequests error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

}

module.exports = new AdController();