/**
 * Simple translation utility for backend
 * Supports English and Vietnamese
 * Similar structure to frontend i18n
 */

const path = require('path');
const fs = require('fs');

// Load translation files (similar to frontend)
let translations = {
  en: {},
  vi: {}
};

// Load translations from JSON files
try {
  const enPath = path.join(__dirname, '../locales/en.json');
  const viPath = path.join(__dirname, '../locales/vi.json');
  
  if (fs.existsSync(enPath)) {
    translations.en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  }
  
  if (fs.existsSync(viPath)) {
    translations.vi = JSON.parse(fs.readFileSync(viPath, 'utf8'));
  }
} catch (error) {
  console.error('[Translation] Error loading translation files:', error);
  // Fallback translations
  translations = {
    en: {
      common: { someone: "Someone", user: "User" },
      messages: { sentYouAMessage: "sent you a message" }
    },
    vi: {
      common: { someone: "Người dùng", user: "Người dùng" },
      messages: { sentYouAMessage: "đã gửi tin nhắn cho bạn" }
    }
  };
}

/**
 * Get translation for a key (supports nested keys like "common.someone")
 * @param {String} key - Translation key (e.g., "common.someone" or "messages.sentYouAMessage")
 * @param {String} locale - Language locale ('en' or 'vi'), defaults to 'vi'
 * @returns {String} Translated text
 */
function t(key, locale = 'vi') {
  const lang = locale === 'en' ? 'en' : 'vi';
  const translation = translations[lang];
  
  if (!translation) {
    return key;
  }
  
  // Support nested keys like "common.someone"
  const keys = key.split('.');
  let value = translation;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to Vietnamese, then return key if not found
      const viValue = translations.vi;
      let viResult = viValue;
      for (const viKey of keys) {
        if (viResult && typeof viResult === 'object' && viKey in viResult) {
          viResult = viResult[viKey];
        } else {
          return key; // Return key if not found in both languages
        }
      }
      return typeof viResult === 'string' ? viResult : key;
    }
  }
  
  return typeof value === 'string' ? value : key;
}

/**
 * Get user's language preference from database
 * @param {String} accountId - User's account ID
 * @returns {Promise<String>} Locale ('en' or 'vi')
 */
async function getUserLocale(accountId) {
  try {
    if (!accountId) return 'vi';
    
    const { getPool, sql } = require("../db/sqlserver");
    const pool = await getPool();
    
    // Query language preference from Accounts table
    // Note: You may need to add LanguagePreference column to Accounts table
    // ALTER TABLE Accounts ADD LanguagePreference NVARCHAR(10) DEFAULT 'vi';
    const result = await pool.request()
      .input("AccountId", sql.UniqueIdentifier, accountId)
      .query(`
        SELECT TOP 1 
          COALESCE(LanguagePreference, 'vi') AS LanguagePreference
        FROM Accounts 
        WHERE AccountId = @AccountId
      `);
    
    if (result.recordset.length > 0) {
      const preference = result.recordset[0].LanguagePreference;
      return (preference === 'en' || preference === 'vi') ? preference : 'vi';
    }
    
    return 'vi';
  } catch (error) {
    // If column doesn't exist yet, return default
    if (error.message && error.message.includes('LanguagePreference')) {
      console.log('[Translation] LanguagePreference column not found, using default');
    } else {
      console.warn('[Translation] Error getting user locale:', error.message);
    }
    return 'vi';
  }
}

/**
 * Get locale from request with priority (NO DATABASE REQUIRED):
 * 1. X-Locale header (from frontend i18n) - RECOMMENDED
 * 2. Request body locale
 * 3. Query parameter locale
 * 4. Accept-Language header
 * 5. Default 'vi'
 * 
 * Optional: User preference from database (if you want to store it)
 * @param {Object} req - Express request object
 * @param {Boolean} useDatabase - Whether to check database (default: false)
 * @returns {Promise<String>} Locale ('en' or 'vi')
 */
/**
 * Get locale from HTTP request
 * 
 * @param {Object} req - Express request object
 * @param {boolean} useDatabase - If true, will query database for user's language preference
 *                                If false (default), only reads from headers/body/query (faster, simpler)
 * @returns {Promise<string>} - 'en' or 'vi'
 * 
 * Priority order:
 * 1. X-Locale header (from frontend localStorage) ← RECOMMENDED, fastest
 * 2. Database (only if useDatabase = true) ← Optional, slower
 * 3. Request body locale
 * 4. Query parameter locale
 * 5. Accept-Language header
 * 6. Default: 'vi'
 */
async function getLocaleFromRequest(req, useDatabase = false) {
  // Priority 1: X-Locale header
  // Frontend tự động gửi header này trong mọi request
  // Example request:
  //   POST /api/messages/message
  //   Headers: {
  //     "Authorization": "Bearer token...",
  //     "X-Locale": "vi"  ← Frontend gửi từ localStorage.getItem('lang')
  //   }
  // Backend đọc: req.headers['x-locale'] → "vi"
  // Note: HTTP headers thường lowercase, nên 'X-Locale' → 'x-locale'
  if (req.headers['x-locale']) {
    const locale = req.headers['x-locale'].toLowerCase();
    if (locale === 'en' || locale === 'vi') {
      // Debug log (can be removed in production)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Translation] Detected locale from X-Locale header: ${locale}`);
      }
      return locale;
    }
  }
  
  // Priority 2: Database (ONLY if useDatabase = true)
  // useDatabase = false (default): KHÔNG query database → Nhanh hơn, đơn giản hơn
  // useDatabase = true: Sẽ query database để lấy LanguagePreference từ Accounts table
  // 
  // Tại sao dùng false?
  // - Frontend đã tự động gửi X-Locale header → Đủ rồi!
  // - Không cần thêm column LanguagePreference vào database
  // - Không cần migration script
  // - Nhanh hơn (không query DB)
  // - Real-time (user đổi ngôn ngữ → ngay lập tức áp dụng)
  if (useDatabase && req.user?.id) {
    try {
      const userLocale = await getUserLocale(req.user.id);
      if (userLocale && userLocale !== 'vi') { // Only use if not default
        return userLocale;
      }
    } catch (error) {
      // Silently continue to other methods
    }
  }
  
  // Priority 2: Request body locale
  if (req.body?.locale) {
    return req.body.locale === 'en' ? 'en' : 'vi';
  }
  
  // Priority 3: Query parameter locale
  if (req.query?.locale) {
    return req.query.locale === 'en' ? 'en' : 'vi';
  }
  
  // Priority 4: Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    if (acceptLanguage.includes('en')) return 'en';
    if (acceptLanguage.includes('vi')) return 'vi';
  }
  
  // Priority 5: Default to Vietnamese
  return 'vi';
}

/**
 * Synchronous version - for cases where async is not possible
 * Uses only request headers/body/query (no database lookup)
 * @param {Object} req - Express request object
 * @returns {String} Locale ('en' or 'vi')
 */
function getLocaleFromRequestSync(req) {
  // Check request body locale
  if (req.body?.locale) {
    return req.body.locale === 'en' ? 'en' : 'vi';
  }
  
  // Check query parameter locale
  if (req.query?.locale) {
    return req.query.locale === 'en' ? 'en' : 'vi';
  }
  
  // Check Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    if (acceptLanguage.includes('en')) return 'en';
    if (acceptLanguage.includes('vi')) return 'vi';
  }
  
  // Default to Vietnamese
  return 'vi';
}

module.exports = {
  t,
  getLocaleFromRequest, // Async version (checks database)
  getLocaleFromRequestSync, // Sync version (no database)
  getUserLocale,
  translations,
};

