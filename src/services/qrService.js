// src/services/qrService.js
const QRCode = require('qrcode');

class QRService {
  /**
   * Generate QR code cho booking confirmation
   * @param {string} bookedScheduleId - ID của booking
   * @param {Object} bookingData - Thông tin booking
   * @returns {Promise<string>} Base64 QR code string
   */
  async generateBookingQR(bookedScheduleId, bookingData = null) {
    try {
      // Nếu không có bookingData, lấy từ database
      if (!bookingData) {
        const bookedScheduleModel = require('../models/bookedScheduleModel');
        bookingData = await bookedScheduleModel.getBookedScheduleWithDetails(bookedScheduleId);

        if (!bookingData) {
          throw new Error('Booking not found');
        }
      }

      // Tạo dữ liệu QR code
      const qrData = {
        type: 'booking_confirmation',
        bookingId: bookedScheduleId,
        customerName: bookingData.BookerName,
        phone: bookingData.BookerPhone,
        comboName: bookingData.ComboName,
        price: bookingData.Price,
        finalPaymentAmount: bookingData.TotalAmount,
        barName: bookingData.BarName,
        bookingDate: bookingData.BookingDate,
        generatedAt: new Date().toISOString(),
        // Thêm checksum để verify
        checksum: this.generateChecksum(bookedScheduleId, bookingData.TotalAmount)
      };

      // Generate QR code as base64 string
      const qrCodeBase64 = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      return qrCodeBase64;
    } catch (error) {
      console.error('Error generating booking QR:', error);
      throw new Error('Không thể tạo QR code cho booking');
    }
  }

  /**
   * Validate QR code data và confirm booking
   * @param {Object} qrData - Dữ liệu từ QR code
   * @param {string} barId - ID của bar (để verify quyền)
   * @returns {Promise<Object>} Kết quả validation và confirmation
   */
  async validateAndConfirmBooking(qrData, barId) {
    try {
      // Verify QR data structure
      if (!qrData || qrData.type !== 'booking_confirmation') {
        return { valid: false, reason: 'Invalid QR code format' };
      }

      // Verify checksum
      const expectedChecksum = this.generateChecksum(qrData.bookingId, qrData.finalPaymentAmount);
      if (qrData.checksum !== expectedChecksum) {
        return { valid: false, reason: 'Invalid QR code checksum' };
      }

      // Check if booking exists
      const bookedScheduleModel = require('../models/bookedScheduleModel');
      const booking = await bookedScheduleModel.getBookedScheduleById(qrData.bookingId);

      if (!booking) {
        return { valid: false, reason: 'Booking not found' };
      }

      // Verify this QR belongs to the correct bar
      if (booking.ReceiverId !== barId) {
        return { valid: false, reason: 'QR code không hợp lệ cho quán này' };
      }

      // Check if booking is paid
      // Backward-compat: một số luồng cũ set PaymentStatus='Done'
      if (booking.PaymentStatus !== 'Paid' && booking.PaymentStatus !== 'Done') {
        return { valid: false, reason: 'Booking chưa được thanh toán' };
      }

      const scheduleStatus = booking.ScheduleStatus || booking.scheduleStatus;

      // Logic mới:
      // - Nếu status = 'Pending' → chuyển sang 'Confirmed' (lần đầu bar confirm)
      // - Nếu status = 'Confirmed' → chuyển sang 'Arrived' (scan QR khi khách tới)
      // - Nếu status = 'Arrived' hoặc 'Ended' → không cần làm gì (đã xử lý rồi)

      let newStatus = null;
      let message = '';

      if (scheduleStatus === 'Pending') {
        // Lần đầu confirm → chuyển sang Confirmed
        newStatus = 'Confirmed';
        message = 'Xác nhận booking thành công';
      } else if (scheduleStatus === 'Confirmed') {
        // Scan QR khi khách tới → chuyển sang Arrived
        newStatus = 'Arrived';
        message = 'Xác nhận khách đã tới quán';
      } else if (scheduleStatus === 'Arrived') {
        return {
          valid: false,
          reason: 'Khách đã được xác nhận tới quán rồi',
          alreadyConfirmed: true,
          currentStatus: 'Arrived'
        };
      } else if (scheduleStatus === 'Ended' || scheduleStatus === 'Completed') {
        return {
          valid: false,
          reason: 'Booking đã kết thúc',
          alreadyConfirmed: true,
          currentStatus: scheduleStatus
        };
      } else {
        // Các trạng thái khác (Canceled, Rejected) không cho confirm
        return {
          valid: false,
          reason: `Không thể xác nhận booking ở trạng thái: ${scheduleStatus}`
        };
      }

      // Update booking status
      const updatedBooking = await bookedScheduleModel.updateBookedScheduleStatuses(
        qrData.bookingId,
        { scheduleStatus: newStatus }
      );

      return {
        valid: true,
        booking: updatedBooking,
        message: message,
        confirmedAt: new Date(),
        newStatus: newStatus
      };

    } catch (error) {
      console.error('Error validating QR code:', error);
      return { valid: false, reason: 'Lỗi hệ thống khi xác nhận booking' };
    }
  }

  /**
   * Generate checksum cho QR data
   * @param {string} bookingId
   * @param {number} amount
   * @returns {string} Checksum string
   */
  generateChecksum(bookingId, amount) {
    const data = `${bookingId}-${amount}-smoker-qr`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).toUpperCase();
  }

  /**
   * Generate QR code cho display (không chứa sensitive data)
   * @param {string} bookedScheduleId
   * @returns {Promise<string>} Base64 QR code string
   */
  async generateDisplayQR(bookedScheduleId) {
    try {
      const qrData = {
        type: 'booking_display',
        bookingId: bookedScheduleId,
        display: true,
        timestamp: Date.now()
      };

      const qrCodeBase64 = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'L',
        type: 'image/png',
        quality: 0.8,
        margin: 1,
        width: 200
      });

      return qrCodeBase64;
    } catch (error) {
      console.error('Error generating display QR:', error);
      throw new Error('Không thể tạo QR code hiển thị');
    }
  }

  /**
   * Batch generate QR codes cho multiple bookings
   * @param {Array<string>} bookingIds - Array of booking IDs
   * @returns {Promise<Array<Object>>} Array of QR code results
   */
  async batchGenerateQRCodes(bookingIds) {
    const results = [];

    for (const bookingId of bookingIds) {
      try {
        const qrCode = await this.generateBookingQR(bookingId);
        results.push({
          bookingId,
          qrCode,
          success: true
        });
      } catch (error) {
        results.push({
          bookingId,
          error: error.message,
          success: false
        });
      }
    }

    return results;
  }
}

module.exports = new QRService();


