const PayOS = require("@payos/node");

class PayOSService {
  constructor() {
    this.payOS = null; // Lazy initialization
  }

  /**
   * Khởi tạo PayOS client (lazy initialization)
   * Chỉ khởi tạo khi thực sự cần sử dụng
   */
  _initializePayOS() {
    // Nếu đã khởi tạo rồi thì return
    if (this.payOS) {
      return this.payOS;
    }

    const clientId = process.env.PAYOS_CLIENT_ID;
    const apiKey = process.env.PAYOS_API_KEY;
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY;

    // Validate credentials trước khi khởi tạo PayOS
    if (!clientId || !apiKey || !checksumKey) {
      const missing = [];
      if (!clientId) missing.push("PAYOS_CLIENT_ID");
      if (!apiKey) missing.push("PAYOS_API_KEY");
      if (!checksumKey) missing.push("PAYOS_CHECKSUM_KEY");
      
      throw new Error(
        `PayOS credentials are missing. Please set the following environment variables: ${missing.join(", ")}`
      );
    }

    // Validate credentials không được là empty string
    if (clientId.trim() === "" || apiKey.trim() === "" || checksumKey.trim() === "") {
      throw new Error("PayOS credentials cannot be empty strings. Please check your .env file.");
    }

    try {
      // PayOS constructor nhận các tham số riêng biệt, không phải object
      this.payOS = new PayOS(
        clientId.trim(),
        apiKey.trim(),
        checksumKey.trim()
      );
      return this.payOS;
    } catch (error) {
      console.error("[PayOS Service] Error initializing PayOS:", error);
      throw new Error(`Failed to initialize PayOS: ${error.message}`);
    }
  }

  /**
   * Tạo payment link với PayOS
   * @param {Object} paymentData - Dữ liệu thanh toán
   * @param {number} paymentData.amount - Số tiền thanh toán
   * @param {string} paymentData.orderId - Mã đơn hàng (unique)
   * @param {string} paymentData.description - Mô tả đơn hàng
   * @param {string} paymentData.returnUrl - URL trả về sau khi thanh toán thành công
   * @param {string} paymentData.cancelUrl - URL trả về khi hủy thanh toán
   * @returns {Promise<Object>} Kết quả chứa paymentUrl
   */
  async createPayment(paymentData) {
    try {
      // Lazy initialize PayOS client
      this._initializePayOS();

      const { amount, orderId, orderCode, description, returnUrl, cancelUrl } = paymentData;

      if (!amount || (!orderId && !orderCode) || !description) {
        throw new Error("amount, orderId (or orderCode), and description are required");
      }

      // PayOS SDK sử dụng orderCode, nếu có orderCode thì dùng, không thì dùng orderId
      const finalOrderCode = orderCode || orderId;

      // Đảm bảo returnUrl và cancelUrl luôn có giá trị hợp lệ
      const defaultBaseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
      const finalReturnUrl = returnUrl || `${defaultBaseUrl}/payment-return`;
      const finalCancelUrl = cancelUrl || `${defaultBaseUrl}/payment-cancel`;

      // Validate URLs
      try {
        new URL(finalReturnUrl);
        new URL(finalCancelUrl);
      } catch (urlError) {
        throw new Error(`Invalid URL format: ${urlError.message}`);
      }

      const payload = {
        amount: parseInt(amount),
        orderCode: parseInt(finalOrderCode), // PayOS SDK sử dụng orderCode
        description: String(description),
        returnUrl: finalReturnUrl,
        cancelUrl: finalCancelUrl,
      };

      // Validate payload trước khi gọi API
      if (!payload.amount || payload.amount <= 0) {
        throw new Error("Amount must be a positive number");
      }
      if (!payload.orderCode || payload.orderCode <= 0) {
        throw new Error("OrderCode must be a positive number");
      }
      if (!payload.description || payload.description.trim().length === 0) {
        throw new Error("Description cannot be empty");
      }

      console.log("[PayOS Service] Creating payment link with payload:", {
        amount: payload.amount,
        orderCode: payload.orderCode,
        description: payload.description,
        returnUrl: payload.returnUrl,
        cancelUrl: payload.cancelUrl
      });

      // Khởi tạo PayOS client nếu chưa có
      const payOS = this._initializePayOS();

      // Gọi API PayOS để tạo payment link
      const result = await payOS.createPaymentLink(payload);

      return {
        success: true,
        paymentUrl: result.checkoutUrl || result.paymentUrl,
        orderCode: result.orderCode,
        data: result,
      };
    } catch (error) {
      console.error("[PayOS Service] Error creating payment:", error);
      console.error("[PayOS Service] Error stack:", error.stack);
      console.error("[PayOS Service] Error details:", {
        message: error.message,
        name: error.name,
        code: error.code
      });
      
      // Nếu lỗi liên quan đến validation, throw error message rõ ràng hơn
      if (error.message && error.message.includes("length")) {
        throw new Error(`PayOS validation error: ${error.message}. Please check that all required fields are provided correctly.`);
      }
      
      throw new Error(error.message || "Failed to create payment link");
    }
  }

  /**
   * Xác thực webhook từ PayOS
   * @param {Object} webhookData - Dữ liệu webhook từ PayOS
   * Schema: { code: string, desc: string, success: boolean, data: object, signature: string }
   * @returns {Object|null} Dữ liệu đã được verify hoặc null nếu không hợp lệ
   */
  verifyWebhook(webhookData) {
    try {
      // Lazy initialize PayOS client
      this._initializePayOS();

      if (!webhookData) {
        console.warn("[PayOS Service] Webhook data is empty");
        return null;
      }

      // Validate schema cơ bản
      if (!webhookData.code || !webhookData.desc || !webhookData.data || !webhookData.signature) {
        console.warn("[PayOS Service] Webhook data missing required fields:", {
          hasCode: !!webhookData.code,
          hasDesc: !!webhookData.desc,
          hasData: !!webhookData.data,
          hasSignature: !!webhookData.signature
        });
        return null;
      }

      // Khởi tạo PayOS client nếu chưa có
      const payOS = this._initializePayOS();

      // Sử dụng phương thức verifyPaymentWebhookData từ PayOS SDK
      // Method này sẽ verify signature và trả về data nếu hợp lệ
      const verifiedData = payOS.verifyPaymentWebhookData(webhookData);
      
      if (!verifiedData) {
        console.warn("[PayOS Service] Webhook verification returned null");
        return null;
      }

      return verifiedData;
    } catch (error) {
      console.error("[PayOS Service] Error verifying webhook:", error);
      console.error("[PayOS Service] Error details:", {
        message: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Xử lý webhook từ PayOS
   * @param {Object} verifiedData - Dữ liệu webhook đã được verify (data object)
   * @param {Object} webhookData - Webhook object gốc (để lấy code/desc)
   * @returns {Object} Thông tin đơn hàng đã được xử lý
   */
  async processWebhook(verifiedData, webhookData = null) {
    try {
      // verifiedData từ verifyPaymentWebhookData trả về chính là data object
      // (không phải toàn bộ webhook object)
      // verifiedData = webhookData.data (sau khi đã verify signature)

      if (!verifiedData) {
        throw new Error("Invalid verified webhook data: data is null or undefined");
      }

      // verifiedData là data object từ webhook
      // Có thể có orderCode, amount, description, etc.
      if (!verifiedData.orderCode) {
        throw new Error("Invalid webhook data: missing orderCode");
      }

      // Xác định status dựa trên code từ webhook gốc hoặc từ verifiedData
      // PayOS trả về code "00" cho thành công trong webhook object gốc
      let status = "PAID"; // Mặc định là PAID nếu đã verify thành công
      
      // Ưu tiên lấy code từ webhook gốc (webhookData.code)
      if (webhookData && webhookData.code) {
        status = (webhookData.code === "00" || webhookData.code === 0 || webhookData.code === "0") ? "PAID" : "FAILED";
      } else if (verifiedData.status) {
        // Nếu có status trong data object
        status = verifiedData.status === "PAID" || verifiedData.status === "paid" ? "PAID" : "FAILED";
      } else if (verifiedData.code) {
        // Nếu có code trong data object
        status = (verifiedData.code === "00" || verifiedData.code === 0 || verifiedData.code === "0") ? "PAID" : "FAILED";
      } else if (webhookData && webhookData.desc) {
        // Nếu có desc trong webhook gốc
        const desc = webhookData.desc.toLowerCase();
        status = (desc.includes("success") || desc === "thành công" || desc === "success") ? "PAID" : "FAILED";
      } else if (verifiedData.desc) {
        // Nếu có desc trong data object
        const desc = verifiedData.desc.toLowerCase();
        status = (desc.includes("success") || desc === "thành công" || desc === "success") ? "PAID" : "FAILED";
      }

      console.log("[PayOS Service] Processed webhook status:", {
        orderCode: verifiedData.orderCode,
        status: status,
        webhookCode: webhookData?.code,
        verifiedDataCode: verifiedData?.code,
        verifiedDataStatus: verifiedData?.status
      });

      return {
        success: true,
        orderCode: verifiedData.orderCode,
        amount: verifiedData.amount,
        status: status,
        description: verifiedData.description || verifiedData.desc || webhookData?.desc,
        transactionData: verifiedData,
      };
    } catch (error) {
      console.error("[PayOS Service] Error processing webhook:", error);
      throw new Error(error.message || "Failed to process webhook");
    }
  }

  /**
   * Lấy thông tin payment theo orderCode
   * @param {number} orderCode - Mã đơn hàng từ PayOS
   * @returns {Promise<Object>} Thông tin payment
   */
  async getPaymentInfo(orderCode) {
    try {
      // Khởi tạo PayOS client nếu chưa có
      const payOS = this._initializePayOS();

      // Gọi API PayOS để lấy thông tin payment
      const result = await payOS.getPaymentLinkInformation(orderCode);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error("[PayOS Service] Error getting payment info:", error);
      throw new Error(error.message || "Failed to get payment information");
    }
  }

  /**
   * Hủy payment link
   * @param {number} orderCode - Mã đơn hàng từ PayOS
   * @returns {Promise<Object>} Kết quả hủy
   */
  async cancelPayment(orderCode) {
    try {
      // Khởi tạo PayOS client nếu chưa có
      const payOS = this._initializePayOS();

      const result = await payOS.cancelPaymentLink(orderCode);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error("[PayOS Service] Error canceling payment:", error);
      throw new Error(error.message || "Failed to cancel payment");
    }
  }
}

module.exports = new PayOSService();

