const dns = require('dns').promises;

/**
 * Verify email có tồn tại thực sự bằng cách kiểm tra MX record
 * @param {string} email - Email cần verify
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
async function verifyEmailExists(email) {
  try {
    // Kiểm tra format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { valid: false, reason: 'Email không hợp lệ' };
    }

    const [, domain] = email.split('@');
    if (!domain) {
      return { valid: false, reason: 'Email không hợp lệ' };
    }

    // Kiểm tra MX record của domain
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, reason: 'Email không tồn tại hoặc domain không hợp lệ' };
      }
      
      // Nếu có MX record, email có thể tồn tại
      // Tuy nhiên, không thể chắc chắn 100% vì Gmail và các nhà cung cấp lớn thường chặn verify
      return { valid: true };
    } catch (dnsError) {
      // Nếu không có MX record, domain không hợp lệ
      return { valid: false, reason: 'Email không tồn tại hoặc domain không hợp lệ' };
    }
  } catch (error) {
    console.error('[EmailVerifier] Error:', error);
    // Nếu có lỗi, cho phép tiếp tục (không chặn quá nghiêm)
    return { valid: true };
  }
}

/**
 * Kiểm tra email có pattern không hợp lệ (email giả)
 * @param {string} email - Email cần kiểm tra
 * @returns {boolean} - true nếu có vẻ là email giả
 */
function isFakeEmail(email) {
  const [localPart] = email.split('@');
  
  // Kiểm tra các pattern không hợp lệ
  // 1. Quá nhiều số liên tiếp (>= 10 số)
  if (/\d{10,}/.test(localPart)) {
    return true;
  }

  // 2. Ký tự lặp lại quá nhiều (>= 8 ký tự giống nhau)
  if (/(.)\1{7,}/.test(localPart)) {
    return true;
  }

  // 3. Quá nhiều số trong email (>= 15 số)
  const digitCount = (localPart.match(/\d/g) || []).length;
  if (digitCount >= 15) {
    return true;
  }

  // 4. Chỉ có số hoặc chỉ có ký tự đặc biệt
  if (/^\d+$/.test(localPart) || /^[^a-zA-Z0-9]+$/.test(localPart)) {
    return true;
  }

  return false;
}

module.exports = {
  verifyEmailExists,
  isFakeEmail
};


