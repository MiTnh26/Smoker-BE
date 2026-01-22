const adPackageModel = require("../models/adPackageModel");
const userAdvertisementModel = require("../models/userAdvertisementModel");
const adPurchaseModel = require("../models/adPurchaseModel");
const barPageModel = require("../models/barPageModel");
const notificationService = require("../services/notificationService");
const reviveSyncService = require("../services/reviveSyncService");
const ReviveSyncJob = require("../jobs/reviveSyncJob");
const adPauseRequestModel = require("../models/adPauseRequestModel");
const adResumeRequestModel = require("../models/adResumeRequestModel");
const { getPool, sql } = require("../db/sqlserver");

class AdminAdController {
  // ============================================================
  // QUẢN LÝ GÓI QUẢNG CÁO (AdPackages CRUD)
  // ============================================================

  /**
   * Lấy tất cả gói quảng cáo (cho admin)
   * GET /api/admin/ads/packages
   */
  async getAllPackages(req, res) {
    try {
      const packages = await adPackageModel.getAllPackages();
      return res.json({ success: true, data: packages });
    } catch (error) {
      console.error("[AdminAdController] getAllPackages error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy gói theo ID
   * GET /api/admin/ads/packages/:packageId
   */
  async getPackageById(req, res) {
    try {
      const { packageId } = req.params;
      const pkg = await adPackageModel.findById(packageId);
      
      if (!pkg) {
        return res.status(404).json({ success: false, message: "Package not found" });
      }
      
      return res.json({ success: true, data: pkg });
    } catch (error) {
      console.error("[AdminAdController] getPackageById error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Tạo gói quảng cáo mới
   * POST /api/admin/ads/packages
   */
  async createPackage(req, res) {
    try {
      const { packageName, packageCode, impressions, price, description, isActive, displayOrder, originalPrice } = req.body;
      
      if (!packageName || !packageCode || !impressions || !price) {
        return res.status(400).json({ 
          success: false, 
          message: "packageName, packageCode, impressions, and price are required" 
        });
      }
      
      // Kiểm tra packageCode đã tồn tại chưa
      const existing = await adPackageModel.findByCode(packageCode);
      if (existing) {
        return res.status(400).json({ 
          success: false, 
          message: "Package code already exists" 
        });
      }
      
      const pkg = await adPackageModel.createPackage({
        packageName,
        packageCode,
        impressions: parseInt(impressions),
        price: parseFloat(price),
        description,
        isActive: isActive !== undefined ? isActive : true,
        displayOrder: displayOrder || 0,
        originalPrice: originalPrice ? parseFloat(originalPrice) : null
      });
      
      return res.status(201).json({ 
        success: true, 
        data: pkg,
        message: "Package created successfully" 
      });
    } catch (error) {
      console.error("[AdminAdController] createPackage error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Cập nhật gói quảng cáo
   * PUT /api/admin/ads/packages/:packageId
   */
  async updatePackage(req, res) {
    try {
      const { packageId } = req.params;
      const updateData = req.body;
      
      // Validate packageCode nếu có thay đổi
      if (updateData.packageCode) {
        const existing = await adPackageModel.findByCode(updateData.packageCode);
        if (existing && existing.PackageId !== packageId) {
          return res.status(400).json({ 
            success: false, 
            message: "Package code already exists" 
          });
        }
      }
      
      const updated = await adPackageModel.updatePackage(packageId, {
        packageName: updateData.packageName,
        packageCode: updateData.packageCode,
        impressions: updateData.impressions ? parseInt(updateData.impressions) : undefined,
        price: updateData.price ? parseFloat(updateData.price) : undefined,
        description: updateData.description,
        isActive: updateData.isActive !== undefined ? updateData.isActive : undefined,
        displayOrder: updateData.displayOrder !== undefined ? parseInt(updateData.displayOrder) : undefined,
        originalPrice: updateData.originalPrice !== undefined ? parseFloat(updateData.originalPrice) : undefined
      });
      
      if (!updated) {
        return res.status(404).json({ success: false, message: "Package not found" });
      }
      
      return res.json({ 
        success: true, 
        data: updated,
        message: "Package updated successfully" 
      });
    } catch (error) {
      console.error("[AdminAdController] updatePackage error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Xóa gói quảng cáo (soft delete)
   * DELETE /api/admin/ads/packages/:packageId
   */
  async deletePackage(req, res) {
    try {
      const { packageId } = req.params;
      const deleted = await adPackageModel.deletePackage(packageId);
      
      if (!deleted) {
        return res.status(404).json({ success: false, message: "Package not found" });
      }
      
      return res.json({ 
        success: true, 
        data: deleted,
        message: "Package deleted successfully" 
      });
    } catch (error) {
      console.error("[AdminAdController] deletePackage error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy thống kê gói quảng cáo
   * GET /api/admin/ads/packages/stats
   */
  async getPackageStats(req, res) {
    try {
      const stats = await adPackageModel.getPackageStats();
      return res.json({ success: true, data: stats });
    } catch (error) {
      console.error("[AdminAdController] getPackageStats error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  // QUẢN LÝ QUẢNG CÁO (UserAdvertisements)
  // ============================================================

  /**
   * Lấy danh sách ads pending approval
   * GET /api/admin/ads/pending
   */
  async getPendingAds(req, res) {
    try {
      const { limit = 50 } = req.query;
      const ads = await userAdvertisementModel.getPendingAds(parseInt(limit));
      
      return res.json({ success: true, data: ads });
    } catch (error) {
      console.error("[AdminAdController] getPendingAds error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy chi tiết một ad
   * GET /api/admin/ads/:userAdId
   */
  async getAdById(req, res) {
    try {
      const { userAdId } = req.params;
      
      // Validate UUID format
      if (!userAdId) {
        return res.status(400).json({ success: false, message: "UserAdId is required" });
      }
      
      // UUID regex validation (RFC 4122)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userAdId)) {
        console.warn(`[AdminAdController] Invalid UUID format for UserAdId: ${userAdId}`);
        return res.status(400).json({ success: false, message: "Invalid UserAdId format" });
      }
      
      const ad = await userAdvertisementModel.findById(userAdId);
      
      if (!ad) {
        return res.status(404).json({ success: false, message: "Ad not found" });
      }
      
      return res.json({ success: true, data: ad });
    } catch (error) {
      console.error("[AdminAdController] getAdById error:", error);
      
      // Handle GUID validation errors specifically
      if (error.message && error.message.includes("Invalid GUID")) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid UserAdId format. UserAdId must be a valid UUID." 
        });
      }
      
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin approve ad (sau khi set lên Revive)
   * POST /api/admin/ads/:userAdId/approve
   */
  async approveAd(req, res) {
    try {
      const { userAdId } = req.params;
      const { reviveBannerId, reviveCampaignId, reviveZoneId, pricingModel, bidAmount } = req.body;
      const adminAccountId = req.user?.id || req.user?.accountId;
      
      if (!adminAccountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        return res.status(404).json({ success: false, message: "Ad not found" });
      }
      
      // Approve ad
      const updatedAd = await userAdvertisementModel.approveAd(userAdId, adminAccountId, {
        reviveBannerId,
        reviveCampaignId,
        reviveZoneId,
        pricingModel,
        bidAmount: bidAmount ? parseFloat(bidAmount) : null
      });
      
      // Gửi notification cho BarPage
      try {
        // Fallback: nếu ad không có AccountId (DB đã bỏ cột), resolve qua BarPageId
        let receiverAccountId = ad.AccountId;
        if (!receiverAccountId && ad.BarPageId) {
          const barPage = await barPageModel.getBarPageById(ad.BarPageId);
          receiverAccountId = barPage?.AccountId;
        }

        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: receiverAccountId,
          content: `Quảng cáo "${ad.Title}" đã được duyệt. Bạn có thể mua gói quảng cáo để bắt đầu.`,
          link: `/ads/my-ads/${userAdId}`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({ 
        success: true, 
        data: updatedAd,
        message: "Ad approved successfully" 
      });
    } catch (error) {
      console.error("[AdminAdController] approveAd error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy danh sách event purchases pending approval
   * GET /api/admin/ads/event-purchases/pending
   */
  async getPendingEventPurchases(req, res) {
    try {
      const { limit = 50 } = req.query;
      const purchases = await adPurchaseModel.getPendingEventPurchases(parseInt(limit));
      
      return res.json({ success: true, data: purchases });
    } catch (error) {
      console.error("[AdminAdController] getPendingEventPurchases error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy tất cả event purchases với filter (cho admin)
   * GET /api/admin/ads/event-purchases?status=pending&limit=50&offset=0
   */
  async getAllEventPurchases(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      const eventModel = require("../models/eventModel");
      const pool = await getPool();
      
      // Luôn chỉ hiển thị purchases đã thanh toán (PaymentStatus = 'paid')
      let whereConditions = ["ap.EventId IS NOT NULL", "ap.PaymentStatus = 'paid'"];
      
      const request = pool.request()
        .input("Limit", sql.Int, parseInt(limit))
        .input("Offset", sql.Int, parseInt(offset));
      
      if (status) {
        request.input("Status", sql.NVarChar(50), status);
        whereConditions.push("ap.Status = @Status");
      }
      
      const whereClause = `WHERE ${whereConditions.join(" AND ")}`;
      
      const result = await request.query(`
        SELECT 
          ap.PurchaseId,
          ap.EventId,
          ap.UserAdId,
          ap.PackageId,
          ap.BarPageId,
          ap.ManagerId,
          ap.PackageName,
          ap.PackageCode,
          ap.Impressions,
          ap.Price,
          ap.PaymentHistoryId,
          ap.PaymentMethod,
          ap.PaymentId,
          ap.PaymentStatus,
          ap.Status,
          ap.UsedImpressions,
          ap.PurchasedAt,
          ap.ActivatedAt,
          ap.CompletedAt,
          ap.CancelledAt,
          e.EventName,
          e.Picture AS EventPicture,
          e.Description AS EventDescription,
          e.RedirectUrl AS EventRedirectUrl,
          bp.BarName,
          bp.Email AS AccountEmail,
          ea.EntityAccountId AS BarEntityAccountId,
          ua.Title AS UserAdTitle,
          ua.Status AS UserAdStatus
        FROM AdPurchases ap
        INNER JOIN Events e ON ap.EventId = e.EventId
        INNER JOIN BarPages bp ON ap.BarPageId = bp.BarPageId
        LEFT JOIN EntityAccounts ea ON ea.EntityType = 'BarPage' AND ea.EntityId = bp.BarPageId
        LEFT JOIN UserAdvertisements ua ON ap.UserAdId = ua.UserAdId
        ${whereClause}
        ORDER BY ap.PurchasedAt DESC
        OFFSET @Offset ROWS
        FETCH NEXT @Limit ROWS ONLY
      `);
      
      // Get total count (using parameterized query to avoid SQL injection)
      const countRequest = pool.request();
      if (status) {
        countRequest.input("Status", sql.NVarChar(50), status);
      }
      
      const countQuery = `
        SELECT COUNT(*) AS Total
        FROM AdPurchases ap
        WHERE ap.EventId IS NOT NULL 
          AND ap.PaymentStatus = 'paid'
          ${status ? 'AND ap.Status = @Status' : ''}
      `;
      
      const countResult = await countRequest.query(countQuery);
      
      return res.json({ 
        success: true, 
        data: result.recordset,
        total: countResult.recordset[0]?.Total || 0
      });
    } catch (error) {
      console.error("[AdminAdController] getAllEventPurchases error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin approve event purchase (tạo UserAdvertisement từ Event và link với Purchase)
   * POST /api/admin/ads/event-purchases/:purchaseId/approve
   */
  async approveEventPurchase(req, res) {
    try {
      const { purchaseId } = req.params;
      const { reviveBannerId, reviveCampaignId, reviveZoneId, pricingModel, bidAmount, redirectUrl } = req.body;
      const adminAccountId = req.user?.id || req.user?.accountId;
      
      if (!adminAccountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      // Lấy purchase với thông tin Event
      const purchase = await adPurchaseModel.findById(purchaseId);
      if (!purchase || !purchase.EventId) {
        return res.status(404).json({ success: false, message: "Event purchase not found" });
      }
      
      // Kiểm tra payment status - chỉ approve purchases đã thanh toán
      if (purchase.PaymentStatus !== 'paid') {
        return res.status(400).json({ 
          success: false, 
          message: "Cannot approve purchase that has not been paid. PaymentStatus must be 'paid'." 
        });
      }
      
      if (purchase.UserAdId) {
        return res.status(400).json({ success: false, message: "Purchase already approved" });
      }
      
      // Lấy thông tin Event
      const eventModel = require("../models/eventModel");
      const event = await eventModel.getEventById(purchase.EventId);
      if (!event) {
        return res.status(404).json({ success: false, message: "Event not found" });
      }
      
      // Lấy AccountId từ BarPage
      const barPage = await barPageModel.getBarPageById(purchase.BarPageId);
      if (!barPage || !barPage.AccountId) {
        return res.status(404).json({ success: false, message: "BarPage not found or missing AccountId" });
      }
      
      // Tạo UserAdvertisement từ Event
      const userAd = await userAdvertisementModel.createUserAd({
        barPageId: purchase.BarPageId,
        accountId: barPage.AccountId,
        title: event.EventName,
        description: event.Description || null,
        imageUrl: event.Picture || event.EventPicture,
        redirectUrl: redirectUrl || event.RedirectUrl || `#` // URL từ event hoặc admin set
      });
      
      // Approve ad và set Revive info
      const approvedAd = await userAdvertisementModel.approveAd(userAd.UserAdId, adminAccountId, {
        reviveBannerId,
        reviveCampaignId,
        reviveZoneId,
        pricingModel,
        bidAmount: bidAmount ? parseFloat(bidAmount) : null
      });
      
      // Link purchase với UserAdvertisement và activate
      const pool = await getPool();
      await pool.request()
        .input("PurchaseId", sql.UniqueIdentifier, purchaseId)
        .input("UserAdId", sql.UniqueIdentifier, userAd.UserAdId)
        .query(`
          UPDATE AdPurchases
          SET UserAdId = @UserAdId,
              Status = 'active'
          WHERE PurchaseId = @PurchaseId
        `);
      
      // Update ad với impressions và activate
      await userAdvertisementModel.updateAdStatus(userAd.UserAdId, {
        status: 'active',
        remainingImpressions: purchase.Impressions,
        totalImpressions: purchase.Impressions
      });
      
      // Update total spent
      await pool.request()
        .input("UserAdId", sql.UniqueIdentifier, userAd.UserAdId)
        .input("Price", sql.Decimal(18,2), purchase.Price)
        .query(`
          UPDATE UserAdvertisements
          SET TotalSpent = TotalSpent + @Price
          WHERE UserAdId = @UserAdId
        `);
      
      // Gửi notification cho BarPage
      try {
        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: barPage.AccountId,
          content: `Quảng cáo cho event "${event.EventName}" đã được duyệt và kích hoạt. Đang hiển thị.`,
          link: `/ads/my-ads/${userAd.UserAdId}`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({ 
        success: true, 
        data: {
          purchase: { ...purchase, UserAdId: userAd.UserAdId },
          userAd: approvedAd,
          event
        },
        message: "Event purchase approved and activated successfully" 
      });
    } catch (error) {
      console.error("[AdminAdController] approveEventPurchase error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin reject ad
   * POST /api/admin/ads/:userAdId/reject
   */
  async rejectAd(req, res) {
    try {
      const { userAdId } = req.params;
      const { reason } = req.body;
      const adminAccountId = req.user?.id || req.user?.accountId;
      
      if (!adminAccountId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad) {
        return res.status(404).json({ success: false, message: "Ad not found" });
      }
      
      // Reject ad
      const updatedAd = await userAdvertisementModel.rejectAd(userAdId, adminAccountId, reason);
      
      // Gửi notification cho BarPage
      try {
        // Fallback: nếu ad không có AccountId (DB đã bỏ cột), resolve qua BarPageId
        let receiverAccountId = ad.AccountId;
        if (!receiverAccountId && ad.BarPageId) {
          const barPage = await barPageModel.getBarPageById(ad.BarPageId);
          receiverAccountId = barPage?.AccountId;
        }

        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: receiverAccountId,
          content: `Quảng cáo "${ad.Title}" đã bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
          link: `/ads/my-ads/${userAdId}`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({ 
        success: true, 
        data: updatedAd,
        message: "Ad rejected" 
      });
    } catch (error) {
      console.error("[AdminAdController] rejectAd error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy tất cả ads với filter
   * GET /api/admin/ads
   */
  async getAllAds(req, res) {
    try {
      const { status, barPageId, limit = 50, offset = 0 } = req.query;
      
      const ads = await userAdvertisementModel.getAllAds({
        status,
        barPageId,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      return res.json({ success: true, data: ads });
    } catch (error) {
      console.error("[AdminAdController] getAllAds error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ============================================================
  // ROUTES CHO ADMIN - SYNC REVIVE STATS
  // ============================================================

  /**
   * Sync tất cả active ads từ Revive
   * POST /api/admin/ads/sync-revive
   */
  async syncAllAdsFromRevive(req, res) {
    try {
      console.log("[AdminAdController] Manual sync all ads from Revive triggered");
      
      const result = await reviveSyncService.syncAllActiveAds();
      
      return res.json({
        success: true,
        message: `Đã sync ${result.synced} quảng cáo từ Revive`,
        data: result
      });
    } catch (error) {
      console.error("[AdminAdController] syncAllAdsFromRevive error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi khi sync từ Revive"
      });
    }
  }

  /**
   * Sync một ad cụ thể từ Revive
   * POST /api/admin/ads/:userAdId/sync-revive
   */
  async syncAdFromRevive(req, res) {
    try {
      const { userAdId } = req.params;
      
      console.log(`[AdminAdController] Manual sync ad ${userAdId} from Revive`);
      
      const result = await reviveSyncService.syncAdStats(userAdId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Không thể sync quảng cáo. Kiểm tra ReviveBannerId hoặc kết nối Revive."
        });
      }
      
      return res.json({
        success: true,
        message: "Đã sync quảng cáo từ Revive thành công",
        data: result
      });
    } catch (error) {
      console.error("[AdminAdController] syncAdFromRevive error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi khi sync từ Revive"
      });
    }
  }

  /**
   * Trigger sync job ngay lập tức (không đợi cron schedule)
   * POST /api/admin/ads/sync-revive/trigger
   */
  async triggerSyncJob(req, res) {
    try {
      console.log("[AdminAdController] Triggering Revive sync job manually");
      
      const result = await ReviveSyncJob.runNow();
      
      return res.json({
        success: true,
        message: `Đã trigger sync job. Synced ${result.synced} quảng cáo`,
        data: result
      });
    } catch (error) {
      console.error("[AdminAdController] triggerSyncJob error:", error);
      
      if (error.message === 'Sync is already running') {
        return res.status(409).json({
          success: false,
          message: "Sync đang chạy, vui lòng đợi..."
        });
      }
      
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi khi trigger sync job"
      });
    }
  }

  /**
   * Debug endpoint: Kiểm tra trạng thái ads và sync
   * GET /api/admin/ads/sync-revive/debug
   */
  async debugSyncStatus(req, res) {
    try {
      const pool = await getPool();
      
      // Lấy tất cả ads có ReviveBannerId
      const allAdsResult = await pool.request().query(`
        SELECT 
          UserAdId, 
          Title,
          Status,
          ReviveBannerId,
          TotalImpressions,
          TotalClicks,
          TotalSpent,
          UpdatedAt
        FROM UserAdvertisements
        WHERE ReviveBannerId IS NOT NULL AND ReviveBannerId != ''
        ORDER BY UpdatedAt DESC
      `);
      
      // Phân loại ads
      const adsByStatus = {
        active: allAdsResult.recordset.filter(ad => ad.Status === 'active'),
        approved: allAdsResult.recordset.filter(ad => ad.Status === 'approved'),
        pending: allAdsResult.recordset.filter(ad => ad.Status === 'pending'),
        other: allAdsResult.recordset.filter(ad => !['active', 'approved', 'pending'].includes(ad.Status))
      };
      
      // Lấy sync logs gần nhất
      const recentLogsResult = await pool.request().query(`
        SELECT TOP 10
          SyncLogId,
          UserAdId,
          ReviveBannerId,
          Impressions,
          Clicks,
          CTR,
          SyncStatus,
          ErrorMessage,
          SyncedAt
        FROM AdSyncLogs
        ORDER BY SyncedAt DESC
      `);
      
      return res.json({
        success: true,
        data: {
          summary: {
            totalAdsWithReviveBannerId: allAdsResult.recordset.length,
            active: adsByStatus.active.length,
            approved: adsByStatus.approved.length,
            pending: adsByStatus.pending.length,
            other: adsByStatus.other.length,
            eligibleForSync: adsByStatus.active.length + adsByStatus.approved.length
          },
          adsByStatus,
          recentSyncLogs: recentLogsResult.recordset
        }
      });
    } catch (error) {
      console.error("[AdminAdController] debugSyncStatus error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Lỗi khi debug sync status"
      });
    }
  }

  /**
   * Lấy danh sách yêu cầu tạm dừng quảng cáo (cho admin)
   * GET /api/admin/ads/pause-requests?status=pending&limit=50&offset=0
   */
  async getPauseRequests(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      
      const pauseRequests = await adPauseRequestModel.getAllPauseRequests({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      // Get total count
      const pool = await getPool();
      const countRequest = pool.request();
      if (status) {
        countRequest.input("Status", sql.NVarChar(50), status);
      }
      
      const countQuery = `
        SELECT COUNT(*) AS Total
        FROM AdPauseRequests
        ${status ? 'WHERE Status = @Status' : ''}
      `;
      
      const countResult = await countRequest.query(countQuery);
      const total = countResult.recordset[0]?.Total || 0;
      
      return res.json({
        success: true,
        data: pauseRequests,
        total
      });
    } catch (error) {
      console.error("[AdminAdController] getPauseRequests error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy chi tiết một yêu cầu pause
   * GET /api/admin/ads/pause-requests/:pauseRequestId
   */
  async getPauseRequestById(req, res) {
    try {
      const { pauseRequestId } = req.params;
      
      const pauseRequest = await adPauseRequestModel.findById(pauseRequestId);
      
      if (!pauseRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Pause request not found" 
        });
      }
      
      return res.json({
        success: true,
        data: pauseRequest
      });
    } catch (error) {
      console.error("[AdminAdController] getPauseRequestById error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin approve pause request (sau khi đã pause trên Revive)
   * POST /api/admin/ads/pause-requests/:pauseRequestId/approve
   */
  async approvePauseRequest(req, res) {
    try {
      const { pauseRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      const { adminNote, revivePaused = true } = req.body;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const pauseRequest = await adPauseRequestModel.findById(pauseRequestId);
      if (!pauseRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Pause request not found" 
        });
      }
      
      console.log(`[AdminAdController] Current pause request status: ${pauseRequest.Status}`);
      
      if (pauseRequest.Status !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          message: `Yêu cầu đã được xử lý (status: ${pauseRequest.Status})` 
        });
      }
      
      console.log(`[AdminAdController] Approving pause request ${pauseRequestId} by admin ${adminAccountId}`);
      
      // Approve pause request và update ad status
      const updatedRequest = await adPauseRequestModel.approvePauseRequest(
        pauseRequestId, 
        adminAccountId,
        { adminNote, revivePaused }
      );
      
      console.log(`[AdminAdController] Pause request approved, new status: ${updatedRequest?.Status}`);

      
      // Gửi notification cho BarPage (lấy AccountId từ BarPages)
      try {
        const { getPool, sql } = require("../db/sqlserver");
        const pool = await getPool();
        const barPageResult = await pool.request()
          .input("BarPageId", sql.UniqueIdentifier, pauseRequest.BarPageId)
          .query(`
            SELECT TOP 1 AccountId
            FROM BarPages
            WHERE BarPageId = @BarPageId
          `);
        
        if (barPageResult.recordset.length > 0) {
          const barPageAccountId = barPageResult.recordset[0].AccountId;
          if (barPageAccountId) {
            await notificationService.createNotification({
              type: "Confirm",
              sender: adminAccountId,
              receiver: barPageAccountId,
              content: `Yêu cầu tạm dừng quảng cáo "${pauseRequest.AdTitle || 'N/A'}" đã được duyệt.`,
              link: `/bar/dashboard`
            });
          }
        }
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tạm dừng đã được duyệt thành công",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] approvePauseRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin reject pause request
   * POST /api/admin/ads/pause-requests/:pauseRequestId/reject
   */
  async rejectPauseRequest(req, res) {
    try {
      const { pauseRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      const { adminNote } = req.body;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const pauseRequest = await adPauseRequestModel.findById(pauseRequestId);
      if (!pauseRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Pause request not found" 
        });
      }
      
      if (pauseRequest.Status !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          message: `Yêu cầu đã được xử lý (status: ${pauseRequest.Status})` 
        });
      }
      
      // Reject pause request
      const updatedRequest = await adPauseRequestModel.rejectPauseRequest(
        pauseRequestId, 
        adminAccountId,
        adminNote
      );
      
      // Gửi notification cho BarPage
      try {
        await notificationService.createNotification({
          type: "Alert",
          sender: adminAccountId,
          receiver: pauseRequest.AccountId,
          content: `Yêu cầu tạm dừng quảng cáo "${pauseRequest.AdTitle}" đã bị từ chối.${adminNote ? ` Lý do: ${adminNote}` : ''}`,
          link: `/bar/dashboard`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tạm dừng đã bị từ chối",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] rejectPauseRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin complete pause request (sau khi đã pause trên Revive và cập nhật hệ thống)
   * POST /api/admin/ads/pause-requests/:pauseRequestId/complete
   */
  async completePauseRequest(req, res) {
    try {
      const { pauseRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const pauseRequest = await adPauseRequestModel.findById(pauseRequestId);
      if (!pauseRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Pause request not found" 
        });
      }
      
      if (pauseRequest.Status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          message: "Yêu cầu đã được hoàn tất" 
        });
      }
      
      // Complete pause request
      const updatedRequest = await adPauseRequestModel.completePauseRequest(
        pauseRequestId, 
        adminAccountId
      );
      
      return res.json({
        success: true,
        message: "Yêu cầu tạm dừng đã được hoàn tất",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] completePauseRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy danh sách yêu cầu tiếp tục quảng cáo (cho admin)
   * GET /api/admin/ads/resume-requests?status=pending&limit=50&offset=0
   */
  async getResumeRequests(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      
      const resumeRequests = await adResumeRequestModel.getAllResumeRequests({
        status,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      // Get total count
      const pool = await getPool();
      const countRequest = pool.request();
      if (status) {
        countRequest.input("Status", sql.NVarChar(50), status);
      }
      
      const countQuery = `
        SELECT COUNT(*) AS Total
        FROM AdResumeRequests
        ${status ? 'WHERE Status = @Status' : ''}
      `;
      
      const countResult = await countRequest.query(countQuery);
      const total = countResult.recordset[0]?.Total || 0;
      
      return res.json({
        success: true,
        data: resumeRequests,
        total
      });
    } catch (error) {
      console.error("[AdminAdController] getResumeRequests error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Lấy chi tiết một yêu cầu resume
   * GET /api/admin/ads/resume-requests/:resumeRequestId
   */
  async getResumeRequestById(req, res) {
    try {
      const { resumeRequestId } = req.params;
      
      const resumeRequest = await adResumeRequestModel.findById(resumeRequestId);
      
      if (!resumeRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Resume request not found" 
        });
      }
      
      return res.json({
        success: true,
        data: resumeRequest
      });
    } catch (error) {
      console.error("[AdminAdController] getResumeRequestById error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin approve resume request (sau khi đã resume trên Revive)
   * POST /api/admin/ads/resume-requests/:resumeRequestId/approve
   */
  async approveResumeRequest(req, res) {
    try {
      const { resumeRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      const { adminNote, reviveResumed = true } = req.body;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const resumeRequest = await adResumeRequestModel.findById(resumeRequestId);
      if (!resumeRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Resume request not found" 
        });
      }
      
      if (resumeRequest.Status !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          message: `Yêu cầu đã được xử lý (status: ${resumeRequest.Status})` 
        });
      }
      
      // Approve resume request và update ad status
      const updatedRequest = await adResumeRequestModel.approveResumeRequest(
        resumeRequestId, 
        adminAccountId,
        { adminNote, reviveResumed }
      );
      
      // Gửi notification cho BarPage
      try {
        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: resumeRequest.AccountId,
          content: `Yêu cầu tiếp tục quảng cáo "${resumeRequest.AdTitle}" đã được duyệt.`,
          link: `/bar/dashboard`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tiếp tục đã được duyệt thành công",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] approveResumeRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin reject resume request
   * POST /api/admin/ads/resume-requests/:resumeRequestId/reject
   */
  async rejectResumeRequest(req, res) {
    try {
      const { resumeRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      const { adminNote } = req.body;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const resumeRequest = await adResumeRequestModel.findById(resumeRequestId);
      if (!resumeRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Resume request not found" 
        });
      }
      
      if (resumeRequest.Status !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          message: `Yêu cầu đã được xử lý (status: ${resumeRequest.Status})` 
        });
      }
      
      // Reject resume request
      const updatedRequest = await adResumeRequestModel.rejectResumeRequest(
        resumeRequestId, 
        adminAccountId,
        adminNote
      );
      
      // Gửi notification cho BarPage
      try {
        await notificationService.createNotification({
          type: "Alert",
          sender: adminAccountId,
          receiver: resumeRequest.AccountId,
          content: `Yêu cầu tiếp tục quảng cáo "${resumeRequest.AdTitle}" đã bị từ chối.${adminNote ? ` Lý do: ${adminNote}` : ''}`,
          link: `/bar/dashboard`
        });
      } catch (notifError) {
        console.warn("[AdminAdController] Failed to send notification:", notifError);
      }
      
      return res.json({
        success: true,
        message: "Yêu cầu tiếp tục đã bị từ chối",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] rejectResumeRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Admin complete resume request (sau khi đã resume trên Revive và cập nhật hệ thống)
   * POST /api/admin/ads/resume-requests/:resumeRequestId/complete
   */
  async completeResumeRequest(req, res) {
    try {
      const { resumeRequestId } = req.params;
      const adminAccountId = req.user?.id || req.user?.accountId;
      
      if (!adminAccountId) {
        return res.status(401).json({ 
          success: false, 
          message: "Unauthorized" 
        });
      }
      
      // Kiểm tra request tồn tại
      const resumeRequest = await adResumeRequestModel.findById(resumeRequestId);
      if (!resumeRequest) {
        return res.status(404).json({ 
          success: false, 
          message: "Resume request not found" 
        });
      }
      
      if (resumeRequest.Status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          message: "Yêu cầu đã được hoàn tất" 
        });
      }
      
      // Complete resume request
      const updatedRequest = await adResumeRequestModel.completeResumeRequest(
        resumeRequestId, 
        adminAccountId
      );
      
      return res.json({
        success: true,
        message: "Yêu cầu tiếp tục đã được hoàn tất",
        data: updatedRequest
      });
      
    } catch (error) {
      console.error("[AdminAdController] completeResumeRequest error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new AdminAdController();


