const adPackageModel = require("../models/adPackageModel");
const userAdvertisementModel = require("../models/userAdvertisementModel");
const notificationService = require("../services/notificationService");
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
      const ad = await userAdvertisementModel.findById(userAdId);
      
      if (!ad) {
        return res.status(404).json({ success: false, message: "Ad not found" });
      }
      
      return res.json({ success: true, data: ad });
    } catch (error) {
      console.error("[AdminAdController] getAdById error:", error);
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
        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: ad.AccountId,
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
        await notificationService.createNotification({
          type: "Confirm",
          sender: adminAccountId,
          receiver: ad.AccountId,
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
}

module.exports = new AdminAdController();


