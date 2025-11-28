const payosService = require("../services/payosService");

class PayOSController {
  /**
   * Tạo payment link
   * POST /api/pay/create
   */
  async createPayment(req, res) {
    try {
      const { amount, orderId, description, returnUrl, cancelUrl } = req.body;

      if (!amount || !orderId || !description) {
        return res.status(400).json({
          success: false,
          message: "amount, orderId, and description are required",
        });
      }

      const paymentData = {
        amount,
        orderId,
        description,
        returnUrl,
        cancelUrl,
      };

      const result = await payosService.createPayment(paymentData);

      return res.status(200).json({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          orderCode: result.orderCode,
        },
        message: "Payment link created successfully",
      });
    } catch (error) {
      console.error("[PayOS Controller] Error creating payment:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating payment link",
        error: error.message,
      });
    }
  }

  /**
   * Webhook endpoint từ PayOS
   * POST /api/pay/webhook
   * PayOS sẽ gửi callback đến endpoint này khi trạng thái thanh toán thay đổi
   */
  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;
      
      console.log("[PayOS Controller] Webhook received:", {
        hasBody: !!webhookData,
        bodyKeys: webhookData ? Object.keys(webhookData) : [],
        headers: {
          clientId: req.headers["x-client-id"],
          apiKey: req.headers["x-api-key"] ? "***" : null
        }
      });

      // 1. Kiểm tra headers (x-client-id, x-api-key) hoặc signature theo doc PayOS
      const clientId = req.headers["x-client-id"];
      const apiKey = req.headers["x-api-key"];

      // Verify headers nếu cần (tùy theo yêu cầu của PayOS)
      if (process.env.PAYOS_CLIENT_ID && clientId !== process.env.PAYOS_CLIENT_ID) {
        console.warn("[PayOS Controller] Invalid client ID in webhook");
        // Có thể không reject ngay, tùy yêu cầu bảo mật
      }

      // 2. Xác thực checksum/signature
      console.log("[PayOS Controller] Verifying webhook signature...");
      const verifiedData = payosService.verifyWebhook(webhookData);

      if (!verifiedData) {
        console.warn("[PayOS Controller] Webhook verification failed - Invalid signature");
        console.warn("[PayOS Controller] Webhook data structure:", {
          hasCode: !!webhookData?.code,
          hasDesc: !!webhookData?.desc,
          hasData: !!webhookData?.data,
          hasSignature: !!webhookData?.signature,
          code: webhookData?.code,
          desc: webhookData?.desc
        });
        return res.status(401).json({ 
          success: false, 
          message: "Invalid webhook signature" 
        });
      }

      console.log("[PayOS Controller] Webhook verified successfully");

      // 3. Xử lý webhook data đã được verify
      const processedData = await payosService.processWebhook(verifiedData);
      console.log("[PayOS Controller] Processed webhook data:", {
        orderCode: processedData.orderCode,
        status: processedData.status,
        amount: processedData.amount
      });

      // 4. Cập nhật order trong DB
      // Tìm AdPurchase theo orderCode (PaymentId)
      const adPurchaseModel = require("../models/adPurchaseModel");
      const purchase = await adPurchaseModel.findByPaymentId(processedData.orderCode.toString());
      
      if (purchase) {
        console.log("[PayOS Controller] Found purchase:", {
          purchaseId: purchase.PurchaseId,
          currentPaymentStatus: purchase.PaymentStatus,
          currentStatus: purchase.Status
        });
        // Xử lý AdPurchase payment
        await this.handleAdPurchasePayment(purchase, processedData);
      } else {
        // Có thể là booking hoặc order khác - xử lý ở đây nếu cần
        console.log("[PayOS Controller] Purchase not found for orderCode:", processedData.orderCode);
      }

      console.log("[PayOS Controller] Webhook processed successfully:", {
        orderCode: processedData.orderCode,
        status: processedData.status,
        amount: processedData.amount,
      });

      // 5. Trả về 200 OK để PayOS biết đã nhận được webhook
      return res.status(200).json({
        success: true,
        message: "Webhook processed successfully",
      });
    } catch (error) {
      console.error("[PayOS Controller] Error handling webhook:", error);
      console.error("[PayOS Controller] Error stack:", error.stack);
      // Vẫn trả về 200 để PayOS không retry liên tục
      // Hoặc trả về error code nếu muốn PayOS retry
      return res.status(200).json({
        success: false,
        message: "Webhook processing error",
        error: error.message,
      });
    }
  }

  /**
   * Lấy thông tin payment
   * GET /api/pay/info/:orderCode
   */
  async getPaymentInfo(req, res) {
    try {
      const { orderCode } = req.params;

      if (!orderCode) {
        return res.status(400).json({
          success: false,
          message: "orderCode is required",
        });
      }

      const result = await payosService.getPaymentInfo(parseInt(orderCode));

      return res.status(200).json({
        success: true,
        data: result.data,
        message: "Payment information retrieved successfully",
      });
    } catch (error) {
      console.error("[PayOS Controller] Error getting payment info:", error);
      return res.status(500).json({
        success: false,
        message: "Error getting payment information",
        error: error.message,
      });
    }
  }

  /**
   * Hủy payment link
   * POST /api/pay/cancel/:orderCode
   */
  async cancelPayment(req, res) {
    try {
      const { orderCode } = req.params;

      if (!orderCode) {
        return res.status(400).json({
          success: false,
          message: "orderCode is required",
        });
      }

      const result = await payosService.cancelPayment(parseInt(orderCode));

      return res.status(200).json({
        success: true,
        data: result.data,
        message: "Payment canceled successfully",
      });
    } catch (error) {
      console.error("[PayOS Controller] Error canceling payment:", error);
      return res.status(500).json({
        success: false,
        message: "Error canceling payment",
        error: error.message,
      });
    }
  }

  /**
   * Xử lý thanh toán cho AdPurchase
   */
  async handleAdPurchasePayment(purchase, processedData) {
    try {
      console.log("[PayOS Controller] handleAdPurchasePayment called:", {
        purchaseId: purchase.PurchaseId,
        currentPaymentStatus: purchase.PaymentStatus,
        processedStatus: processedData.status
      });

      const adPurchaseModel = require("../models/adPurchaseModel");
      const paymentHistoryModel = require("../models/paymentHistoryModel");
      const adPackageModel = require("../models/adPackageModel");
      const notificationService = require("../services/notificationService");
      const entityAccountModel = require("../models/entityAccountModel");
      const eventModel = require("../models/eventModel");
      const barPageModel = require("../models/barPageModel");
      const { getPool, sql } = require("../db/sqlserver");

      if (processedData.status === "PAID") {
        // Thanh toán thành công
        console.log("[PayOS Controller] AdPurchase payment successful:", purchase.PurchaseId);

        // 1. Lấy EntityAccountId
        console.log("[PayOS Controller] Getting EntityAccountId for AccountId:", purchase.AccountId);
        const entityAccountId = await entityAccountModel.getEntityAccountIdByAccountId(purchase.AccountId);
        
        if (!entityAccountId) {
          console.error("[PayOS Controller] EntityAccountId not found for AccountId:", purchase.AccountId);
          throw new Error("EntityAccountId not found");
        }
        
        console.log("[PayOS Controller] EntityAccountId found:", entityAccountId);

        // 2. Tạo PaymentHistory
        console.log("[PayOS Controller] Creating PaymentHistory...");
        const paymentHistory = await paymentHistoryModel.createPaymentHistory({
          type: 'ad_package',
          senderId: entityAccountId,
          receiverId: null,
          transferContent: `Mua gói quảng cáo: ${purchase.PackageName} (${parseInt(purchase.Impressions).toLocaleString()} lượt xem)`,
          transferAmount: parseFloat(purchase.Price)
        });
        console.log("[PayOS Controller] PaymentHistory created:", paymentHistory.PaymentHistoryId);

        // 3. Update purchase với PaymentHistoryId và status
        console.log("[PayOS Controller] Updating purchase status to 'paid'...");
        const updatedPurchase = await adPurchaseModel.updatePurchaseStatus(purchase.PurchaseId, 'pending', 'paid');
        console.log("[PayOS Controller] Purchase status updated. Result:", {
          purchaseId: updatedPurchase?.PurchaseId,
          paymentStatus: updatedPurchase?.PaymentStatus,
          status: updatedPurchase?.Status
        });
        
        // Update PaymentHistoryId
        console.log("[PayOS Controller] Updating PaymentHistoryId...");
        const pool = await getPool();
        await pool.request()
          .input("PurchaseId", sql.UniqueIdentifier, purchase.PurchaseId)
          .input("PaymentHistoryId", sql.UniqueIdentifier, paymentHistory.PaymentHistoryId)
          .query(`
            UPDATE AdPurchases
            SET PaymentHistoryId = @PaymentHistoryId
            WHERE PurchaseId = @PurchaseId
          `);
        console.log("[PayOS Controller] PaymentHistoryId updated");

        // 4. Update package stats
        console.log("[PayOS Controller] Updating package stats...");
        await adPackageModel.updatePackageStats(purchase.PackageId, parseFloat(purchase.Price), 'increment');
        console.log("[PayOS Controller] Package stats updated");

        // 5. Gửi notification cho admin
        try {
          console.log("[PayOS Controller] Sending notifications to admins...");
          const event = purchase.EventId ? await eventModel.getEventById(purchase.EventId) : null;
          const barPage = await barPageModel.getBarPageById(purchase.BarPageId);
          
          const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
          const barUrl = `${frontendUrl}/bar/${barPage.BarPageId}`;
          
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
          
          for (const admin of adminResult.recordset) {
            await notificationService.createNotification({
              type: "Confirm",
              sender: purchase.AccountId,
              receiver: admin.AccountId,
              content: notificationContent,
              link: `/admin/ads/event-purchases/pending/${purchase.PurchaseId}`
            });
          }
          console.log("[PayOS Controller] Notifications sent to", adminResult.recordset.length, "admins");
        } catch (notifError) {
          console.warn("[PayOS Controller] Failed to send admin notification:", notifError);
        }

        console.log("[PayOS Controller] AdPurchase payment processing completed successfully");
      } else {
        // Thanh toán thất bại
        console.log("[PayOS Controller] AdPurchase payment failed:", purchase.PurchaseId);
        await adPurchaseModel.updatePurchaseStatus(purchase.PurchaseId, 'cancelled', 'failed');
      }
    } catch (error) {
      console.error("[PayOS Controller] Error handling AdPurchase payment:", error);
      console.error("[PayOS Controller] Error stack:", error.stack);
      throw error;
    }
  }
}

module.exports = new PayOSController();

