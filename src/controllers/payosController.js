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
      // Log ngay từ đầu để biết webhook có được gọi không
      console.log("[PayOS Controller] ========== WEBHOOK REQUEST RECEIVED ==========");
      console.log("[PayOS Controller] Request method:", req.method);
      console.log("[PayOS Controller] Request URL:", req.url);
      console.log("[PayOS Controller] Request headers:", {
        "content-type": req.headers["content-type"],
        "x-client-id": req.headers["x-client-id"],
        "x-api-key": req.headers["x-api-key"] ? "***" : null,
        "user-agent": req.headers["user-agent"]
      });
      
      const webhookData = req.body;
      
      console.log("[PayOS Controller] Webhook body received:", {
        hasBody: !!webhookData,
        bodyType: typeof webhookData,
        bodyKeys: webhookData ? Object.keys(webhookData) : [],
        bodyString: JSON.stringify(webhookData, null, 2)
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
      // Truyền thêm webhook gốc để có thể lấy code/desc từ đó
      const processedData = await payosService.processWebhook(verifiedData, webhookData);
      console.log("[PayOS Controller] Processed webhook data:", {
        orderCode: processedData.orderCode,
        status: processedData.status,
        amount: processedData.amount
      });

      // 4. Cập nhật order trong DB
      console.log("[PayOS Controller] ========== STEP 4: Looking for purchase/booking ==========");
      console.log("[PayOS Controller] Searching with orderCode:", processedData.orderCode);
      console.log("[PayOS Controller] orderCode type:", typeof processedData.orderCode);
      
      // Tìm AdPurchase theo orderCode (PaymentId)
      const adPurchaseModel = require("../models/adPurchaseModel");
      const purchase = await adPurchaseModel.findByPaymentId(processedData.orderCode.toString());
      
      if (purchase) {
        console.log("[PayOS Controller] ✅ Found purchase:", {
          purchaseId: purchase.PurchaseId,
          currentPaymentStatus: purchase.PaymentStatus,
          currentStatus: purchase.Status
        });
        // Xử lý AdPurchase payment
        await this.handleAdPurchasePayment(purchase, processedData);
      } else {
        console.log("[PayOS Controller] No purchase found, searching for booking...");
        // Tìm booking theo orderCode
        const { getPool, sql } = require("../db/sqlserver");
        const pool = await getPool();
        
        try {
          console.log("[PayOS Controller] Querying BookingPayments table with orderCode:", processedData.orderCode);
          
          // Kiểm tra xem bảng BookingPayments có tồn tại không
          const tableCheck = await pool.request().query(`
            SELECT COUNT(*) as TableExists
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'BookingPayments'
          `);
          
          console.log("[PayOS Controller] BookingPayments table exists:", tableCheck.recordset[0]?.TableExists > 0);
          
          // Query với orderCode - Convert sang BigInt để đảm bảo type match
          const orderCodeBigInt = BigInt(processedData.orderCode);
          console.log("[PayOS Controller] Querying with orderCode (converted to BigInt):", {
            original: processedData.orderCode,
            originalType: typeof processedData.orderCode,
            converted: orderCodeBigInt.toString(),
            convertedType: typeof orderCodeBigInt
          });
          
          const bookingResult = await pool.request()
            .input("OrderCode", sql.BigInt, orderCodeBigInt)
            .query(`
              SELECT BookedScheduleId, OrderCode, CreatedAt
              FROM BookingPayments 
              WHERE OrderCode = @OrderCode
            `);
          
          console.log("[PayOS Controller] BookingPayments query result:", {
            orderCode: processedData.orderCode,
            orderCodeBigInt: orderCodeBigInt.toString(),
            recordCount: bookingResult.recordset.length,
            records: bookingResult.recordset.map(r => ({
              BookedScheduleId: r.BookedScheduleId,
              OrderCode: r.OrderCode?.toString(),
              CreatedAt: r.CreatedAt
            }))
          });
          
          // Nếu không tìm thấy, thử query tất cả để debug
          if (bookingResult.recordset.length === 0) {
            console.log("[PayOS Controller] ⚠️ No booking found, querying all BookingPayments for debugging...");
            const allBookings = await pool.request().query(`
              SELECT TOP 10 BookedScheduleId, OrderCode, CreatedAt
              FROM BookingPayments 
              ORDER BY CreatedAt DESC
            `);
            console.log("[PayOS Controller] Recent BookingPayments records:", allBookings.recordset);
          }
          
          if (bookingResult.recordset.length > 0) {
            const bookedScheduleId = bookingResult.recordset[0].BookedScheduleId;
            console.log("[PayOS Controller] ✅ Found booking:", {
              bookedScheduleId: bookedScheduleId,
              orderCode: processedData.orderCode,
              createdAt: bookingResult.recordset[0].CreatedAt
            });
            // Xử lý booking payment
            try {
              await this.handleBookingPayment(bookedScheduleId, processedData);
              console.log("[PayOS Controller] ✅ handleBookingPayment completed successfully");
            } catch (paymentError) {
              console.error("[PayOS Controller] ❌ Error in handleBookingPayment:", paymentError);
              console.error("[PayOS Controller] Payment error details:", {
                message: paymentError.message,
                stack: paymentError.stack,
                code: paymentError.code,
                number: paymentError.number
              });
              // Re-throw để outer catch có thể xử lý
              throw paymentError;
            }
          } else {
            console.error("[PayOS Controller] ❌ Purchase/Booking not found for orderCode:", processedData.orderCode);
            console.error("[PayOS Controller] This means webhook cannot update payment status!");
            // Không throw error ở đây vì có thể là purchase, không phải booking
          }
        } catch (bookingError) {
          console.error("[PayOS Controller] ❌ Error finding/processing booking:", bookingError);
          console.error("[PayOS Controller] Error details:", {
            message: bookingError.message,
            stack: bookingError.stack,
            code: bookingError.code,
            number: bookingError.number
          });
          // Re-throw để outer catch có thể xử lý và log
          throw bookingError;
        }
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

        // 1. Lấy EntityAccountId từ BarPage
        console.log("[PayOS Controller] Getting EntityAccountId from BarPageId:", purchase.BarPageId);
        const barPage = await barPageModel.getBarPageById(purchase.BarPageId);
        
        if (!barPage || !barPage.EntityAccountId) {
          console.error("[PayOS Controller] BarPage or EntityAccountId not found for BarPageId:", purchase.BarPageId);
          throw new Error("EntityAccountId not found");
        }
        
        const entityAccountId = barPage.EntityAccountId;
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

  /**
   * Xử lý thanh toán cho Booking
   */
  async handleBookingPayment(bookedScheduleId, processedData) {
    try {
      console.log("[PayOS Controller] ========== handleBookingPayment STARTED ==========");
      console.log("[PayOS Controller] Input parameters:", {
        bookedScheduleId: bookedScheduleId,
        processedStatus: processedData.status,
        processedAmount: processedData.amount
      });

      const bookedScheduleModel = require("../models/bookedScheduleModel");
      const voucherModel = require("../models/voucherModel");
      const qrService = require("../services/qrService");
      const paymentHistoryModel = require("../models/paymentHistoryModel");
      const DetailSchedule = require("../models/detailSchedule");

      if (processedData.status === "PAID") {
        console.log("[PayOS Controller] ✅ Booking payment successful:", bookedScheduleId);

        // 1. Lấy thông tin booking với chi tiết combo/voucher
        const booking = await bookedScheduleModel.getBookedScheduleWithDetails(bookedScheduleId);
        if (!booking) {
          throw new Error("Booking not found");
        }

        console.log("[PayOS Controller] Booking details:", {
          bookingId: booking.BookedScheduleId,
          comboName: booking.ComboName,
          originalPrice: booking.OriginalPrice,
          discountAmount: Math.max(0, Number(booking.OriginalPrice || 0) - Number(booking.TotalAmount || 0)),
          finalAmount: booking.TotalAmount,
          voucherCode: booking.VoucherCode,
          commissionAmount: Math.floor(Number(booking.OriginalPrice || 0) * 0.15),
          barReceiveAmount: Number(booking.OriginalPrice || 0) - Math.floor(Number(booking.OriginalPrice || 0) * 0.15)
        });

        // 2. Giảm UsedCount của voucher nếu có
        if (booking.VoucherId) {
          console.log("[PayOS Controller] Decrementing voucher usage:", booking.VoucherId);
          await voucherModel.incrementUsedCount(booking.VoucherId);
        }

        // 3. Tạo PaymentHistory cho toàn bộ giao dịch
        // 3a. PaymentHistory cho hoa hồng hệ thống (commission)
        const originalPrice = Number(booking.OriginalPrice || 0);
        const commissionAmount = Math.floor(originalPrice * 0.15);
        const barReceiveAmount = originalPrice - commissionAmount;

        if (commissionAmount > 0) {
          const commissionHistory = await paymentHistoryModel.createPaymentHistory({
            type: 'commission',
            senderId: booking.BookerId,
            receiverId: null, // Platform nhận hoa hồng
            transferContent: `Hoa hồng 15% combo ${booking.ComboName}`,
            transferAmount: commissionAmount
          });
          console.log("[PayOS Controller] Commission PaymentHistory created:", commissionHistory.PaymentHistoryId);
        }

        // 3b. PaymentHistory cho tiền bar nhận
        if (barReceiveAmount > 0) {
          const barPaymentHistory = await paymentHistoryModel.createPaymentHistory({
            type: 'booking',
            senderId: booking.BookerId,
            receiverId: booking.ReceiverId, // Bar nhận tiền
            transferContent: `Thanh toán combo ${booking.ComboName}`,
            transferAmount: barReceiveAmount
          });
          console.log("[PayOS Controller] Bar PaymentHistory created:", barPaymentHistory.PaymentHistoryId);
        }

        // 4. Cập nhật booking status thành Paid
        const updatedBooking = await bookedScheduleModel.updateBookedScheduleStatuses(
          bookedScheduleId,
          { paymentStatus: "Paid" }
        );

        console.log("[PayOS Controller] ✅ Booking payment status updated to Paid");

        // 5. Generate QR code cho bar scan confirm
        console.log("[PayOS Controller] Generating QR code for booking confirmation...");
        const qrCode = await qrService.generateBookingQR(bookedScheduleId, booking);

        // 6. Lưu QR code vào Mongo DetailSchedule (DB không có cột QRCode)
        if (booking.MongoDetailId) {
          await DetailSchedule.findByIdAndUpdate(
            booking.MongoDetailId,
            { $set: { QRCode: qrCode } },
            { new: true }
          );
        }

        console.log("[PayOS Controller] ✅ QR code generated and saved:", {
          bookingId: bookedScheduleId,
          qrCodeLength: qrCode.length
        });

        // 7. Gửi notification cho bar
        try {
          const notificationService = require("../services/notificationService");
          await notificationService.notifyBarNewBooking(bookedScheduleId);
          console.log("[PayOS Controller] ✅ Bar notification sent");
        } catch (notifyError) {
          console.warn("[PayOS Controller] ⚠️ Failed to send bar notification:", notifyError.message);
        }

        console.log("[PayOS Controller] ========== handleBookingPayment COMPLETED SUCCESSFULLY ==========");
      } else {
        // Thanh toán thất bại
        console.log("[PayOS Controller] ❌ Booking payment failed:", {
          bookingId: bookedScheduleId,
          status: processedData.status
        });

        await bookedScheduleModel.updateBookedScheduleStatuses(bookedScheduleId, {
          paymentStatus: "Failed"
        });
        console.log("[PayOS Controller] Updated payment status to 'Failed'");
      }
    } catch (error) {
      console.error("[PayOS Controller] ========== handleBookingPayment ERROR ==========");
      console.error("[PayOS Controller] Error:", error.message);
      console.error("[PayOS Controller] Stack:", error.stack);
      console.error("[PayOS Controller] Error details:", {
        name: error.name,
        code: error.code,
        number: error.number,
        state: error.state,
        class: error.class,
        serverName: error.serverName,
        procName: error.procName,
        lineNumber: error.lineNumber
      });
      throw error;
    }
  }

  /**
   * Test endpoint để simulate webhook (chỉ dùng cho development)
   * POST /api/pay/test-webhook
   * Body: { orderCode: number, bookingId?: string }
   */
  async testWebhook(req, res) {
    try {
      const { orderCode, bookingId } = req.body;

      if (!orderCode) {
        return res.status(400).json({
          success: false,
          message: "orderCode is required"
        });
      }

      console.log("[PayOS Controller] ========== TEST WEBHOOK CALLED ==========");
      console.log("[PayOS Controller] Test webhook parameters:", {
        orderCode: orderCode,
        bookingId: bookingId
      });

      // Tìm booking theo orderCode hoặc bookingId
      const { getPool, sql } = require("../db/sqlserver");
      const pool = await getPool();

      let bookedScheduleId = null;

      if (bookingId) {
        // Nếu có bookingId, dùng trực tiếp
        bookedScheduleId = bookingId;
        console.log("[PayOS Controller] Using provided bookingId:", bookedScheduleId);
      } else {
        // Tìm booking theo orderCode
        console.log("[PayOS Controller] Searching for booking by orderCode:", orderCode);
        const bookingResult = await pool.request()
          .input("OrderCode", sql.BigInt, orderCode)
          .query(`
            SELECT BookedScheduleId, OrderCode, CreatedAt
            FROM BookingPayments 
            WHERE OrderCode = @OrderCode
          `);

        console.log("[PayOS Controller] BookingPayments query result:", {
          orderCode: orderCode,
          recordCount: bookingResult.recordset.length,
          records: bookingResult.recordset
        });

        if (bookingResult.recordset.length === 0) {
          return res.status(404).json({
            success: false,
            message: `No booking found for orderCode: ${orderCode}`,
            suggestion: "Check if orderCode exists in BookingPayments table"
          });
        }

        bookedScheduleId = bookingResult.recordset[0].BookedScheduleId;
        console.log("[PayOS Controller] Found bookingId:", bookedScheduleId);
      }

      // Simulate processedData từ webhook
      const processedData = {
        orderCode: orderCode,
        status: "PAID",
        amount: 100000,
        description: "Test webhook payment"
      };

      console.log("[PayOS Controller] Simulating webhook with processedData:", processedData);

      // Gọi handleBookingPayment
      await this.handleBookingPayment(bookedScheduleId, processedData);

      return res.status(200).json({
        success: true,
        message: "Test webhook processed successfully",
        data: {
          orderCode: orderCode,
          bookedScheduleId: bookedScheduleId
        }
      });
    } catch (error) {
      console.error("[PayOS Controller] Test webhook error:", error);
      return res.status(500).json({
        success: false,
        message: "Test webhook processing error",
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = new PayOSController();

