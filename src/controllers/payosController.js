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

      // 1. Kiểm tra headers (x-client-id, x-api-key) hoặc signature theo doc PayOS
      const clientId = req.headers["x-client-id"];
      const apiKey = req.headers["x-api-key"];

      // Verify headers nếu cần (tùy theo yêu cầu của PayOS)
      if (process.env.PAYOS_CLIENT_ID && clientId !== process.env.PAYOS_CLIENT_ID) {
        console.warn("[PayOS Controller] Invalid client ID in webhook");
        // Có thể không reject ngay, tùy yêu cầu bảo mật
      }

      // 2. Xác thực checksum/signature
      const verifiedData = payosService.verifyWebhook(webhookData);

      if (!verifiedData) {
        console.warn("[PayOS Controller] Webhook verification failed");
        return res.status(401).json({ 
          success: false, 
          message: "Invalid webhook signature" 
        });
      }

      // 3. Xử lý webhook data đã được verify
      const processedData = await payosService.processWebhook(verifiedData);

      // 4. Cập nhật order trong DB
      // TODO: Implement logic cập nhật payment status trong database
      // Ví dụ:
      // - Tìm booking/order theo orderCode hoặc orderId
      // - Cập nhật paymentStatus = "Paid" hoặc "Failed"
      // - Lưu transaction data vào payment history

      // Ví dụ:
      // const bookingService = require("../services/bookingService");
      // await bookingService.updatePaymentStatus(processedData.orderCode, processedData.status);

      console.log("[PayOS Controller] Webhook processed:", {
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
}

module.exports = new PayOSController();

