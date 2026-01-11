const axios = require("axios");
const barPageModel = require("../models/barPageModel");
const { getPool, sql } = require("../db/sqlserver");

class ReviveAdServerService {
  constructor() {
    // Get Revive URL from environment, ensure it ends with /revive
    let baseUrl = process.env.REVIVE_AD_SERVER_URL || "http://localhost/revive";
    
    // Ensure URL ends with /revive (remove trailing slash first, then add /revive)
    baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    if (!baseUrl.endsWith('/revive')) {
      baseUrl = baseUrl + '/revive';
    }
    
    this.baseUrl = baseUrl;
    console.log(`[ReviveAdServerService] Initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Thay thế localhost URLs bằng production URL trong HTML
   */
  replaceLocalhostUrls(html) {
    if (!html || typeof html !== 'string') return html;
    
    // Nếu Revive server đang chạy localhost, không thay thế URLs (giữ nguyên cho dev)
    const reviveUrl = process.env.REVIVE_AD_SERVER_URL || "http://localhost/revive";
    if (reviveUrl.includes('localhost') || reviveUrl.includes('127.0.0.1')) {
      return html; // Giữ nguyên URLs khi đang dev
    }
    
    // Production frontend URL
    const productionUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://smoker-fe-henna.vercel.app';
    
    let updatedHtml = html;
    
    // Replace URL encoded localhost trong dest parameter
    // Pattern: dest=http%3A%2F%2Flocalhost%3A3000%2Fbar%2F...
    updatedHtml = updatedHtml.replace(
      /dest=(http|https)%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?(%2F[^&"']*?)(&|["']|$)/gi,
      (match, protocol, host, port, encodedPath, suffix) => {
        try {
          // Decode path để lấy path thực tế
          const decodedPath = decodeURIComponent(encodedPath || '');
          // Tạo URL mới với production domain
          const newUrl = productionUrl + decodedPath;
          // Encode lại để giữ trong URL parameter
          return 'dest=' + encodeURIComponent(newUrl) + suffix;
        } catch (e) {
          console.warn(`[ReviveAdServerService] Error replacing URL in dest parameter:`, e);
          return match; // Return original nếu có lỗi
        }
      }
    );
    
    // Replace trong href attributes (không encoded)
    updatedHtml = updatedHtml.replace(
      /(href=["']?)(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/[^"'<>]*?)(["']?)/gi,
      (match, prefix, protocol, host, port, path, suffix) => {
        const newUrl = productionUrl + path;
        return prefix + newUrl + suffix;
      }
    );
    
    // Replace trong href attributes (URL encoded)
    updatedHtml = updatedHtml.replace(
      /(href=["']?)(http|https)%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?(%2F[^"'<>]*?)(["']?)/gi,
      (match, prefix, protocol, host, port, encodedPath, suffix) => {
        try {
          const decodedPath = decodeURIComponent(encodedPath || '');
          const newUrl = productionUrl + decodedPath;
          return prefix + encodeURIComponent(newUrl) + suffix;
        } catch (e) {
          return match;
        }
      }
    );
    
    // Replace trong JavaScript strings
    updatedHtml = updatedHtml.replace(
      /(["'])(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/[^"']*?)\1/gi,
      (match, quote, protocol, host, port, path) => {
        const newUrl = productionUrl + path;
        return quote + newUrl + quote;
      }
    );
    
    // Replace URL encoded localhost trong bất kỳ đâu (fallback)
    updatedHtml = updatedHtml.replace(
      /(http|https)%3A%2F%2F(localhost|127\.0\.0\.1)(%3A\d+)?(%2F[^&"']*?)/gi,
      (match, protocol, host, port, encodedPath) => {
        try {
          const decodedPath = decodeURIComponent(encodedPath || '');
          const newUrl = productionUrl + decodedPath;
          return encodeURIComponent(newUrl);
        } catch (e) {
          return match;
        }
      }
    );
    
    return updatedHtml;
  }

  /**
   * Convert /bar/{BarPageId} URL thành /profile/{EntityAccountId}
   * Query database để lấy EntityAccountId từ BarPageId
   */
  async convertBarUrlToProfileUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    const productionUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://smoker-fe-henna.vercel.app';
    
    // Extract BarPageId từ URL pattern /bar/{BarPageId}
    const barUrlMatch = url.match(/\/bar\/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i);
    if (!barUrlMatch) {
      return url; // Không phải bar URL, return nguyên
    }
    
    const barPageId = barUrlMatch[1];
    console.log(`[ReviveAdServerService] Converting bar URL to profile URL for BarPageId: ${barPageId}`);
    
    try {
      // Query database để lấy EntityAccountId
      const barPage = await barPageModel.getBarPageById(barPageId);
      
      if (barPage && barPage.EntityAccountId) {
        // Thay thế /bar/{BarPageId} bằng /profile/{EntityAccountId}
        const newUrl = url.replace(
          /\/bar\/[0-9A-F-]+/i,
          `/profile/${barPage.EntityAccountId}`
        );
        
        console.log(`[ReviveAdServerService] ✅ Converted URL: ${url} -> ${newUrl}`);
        return newUrl;
      } else {
        console.warn(`[ReviveAdServerService] ⚠️ EntityAccountId not found for BarPageId: ${barPageId}`);
        return url; // Return nguyên nếu không tìm thấy
      }
    } catch (error) {
      console.error(`[ReviveAdServerService] ❌ Error converting bar URL:`, error);
      return url; // Return nguyên nếu có lỗi
    }
  }

  /**
   * Convert tất cả /bar/{BarPageId} URLs trong HTML thành /profile/{EntityAccountId}
   * Xử lý cả URL encoded (trong dest parameter) và không encoded (trong href)
   */
  async convertBarUrlsInHtml(html) {
    if (!html || typeof html !== 'string') return html;
    
    const productionUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://smoker-fe-henna.vercel.app';
    
    // Tìm tất cả BarPageId trong HTML (cả trong /bar/{BarPageId} và URL encoded)
    const barPageIdPattern = /([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/gi;
    const barUrlPattern = /\/bar\/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/gi;
    
    // Tìm tất cả /bar/{UUID} patterns
    const matches = [...html.matchAll(barUrlPattern)];
    
    if (matches.length === 0) {
      // Vẫn cần check dest parameters vì có thể có bar URL trong đó
      const hasDestParam = html.includes('dest=');
      if (!hasDestParam) {
        return html; // Không có bar URLs
      }
    }
    
    console.log(`[ReviveAdServerService] Found ${matches.length} bar URLs to convert, checking dest parameters...`);
    
    let updatedHtml = html;
    const urlCache = {}; // Cache để tránh query nhiều lần cùng BarPageId
    
    // Convert từng URL không encoded
    for (const match of matches) {
      const barPageId = match[1];
      
      if (urlCache[barPageId]) {
        continue; // Đã convert rồi
      }
      
      try {
        // Query database để lấy EntityAccountId
        const barPage = await barPageModel.getBarPageById(barPageId);
        
        if (barPage && barPage.EntityAccountId) {
          const profilePath = `/profile/${barPage.EntityAccountId}`;
          urlCache[barPageId] = profilePath;
          
          // Replace trong HTML (không encoded)
          const barPath = `/bar/${barPageId}`;
          updatedHtml = updatedHtml.replace(new RegExp(barPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), profilePath);
          
          console.log(`[ReviveAdServerService] ✅ Converted: ${barPath} -> ${profilePath}`);
        }
      } catch (error) {
        console.error(`[ReviveAdServerService] ❌ Error converting bar URL for ${barPageId}:`, error);
      }
    }
    
    // Convert trong dest parameter (URL encoded)
    // Tìm tất cả dest parameters và convert nếu có /bar/{BarPageId}
    const destParamPattern = /dest=([^&"']+?)(&|["']|$)/gi;
    const allDestMatches = [...html.matchAll(destParamPattern)];
    
    for (const destMatch of allDestMatches) {
      const encodedDestValue = destMatch[1];
      const suffix = destMatch[2];
      
      try {
        // Decode dest parameter để xem có chứa /bar/{BarPageId} không
        const decodedDest = decodeURIComponent(encodedDestValue);
        const barUrlMatch = decodedDest.match(/\/bar\/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})/i);
        
        if (!barUrlMatch) {
          continue; // Không phải bar URL
        }
        
        const barPageId = barUrlMatch[1];
        
        if (urlCache[barPageId]) {
          // Đã convert rồi, chỉ cần replace
          const profilePath = urlCache[barPageId];
          const newDecodedDest = decodedDest.replace(/\/bar\/[0-9A-F-]+/i, profilePath);
          const newEncodedDest = encodeURIComponent(newDecodedDest);
          updatedHtml = updatedHtml.replace(
            new RegExp(`dest=${encodedDestValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
            `dest=${newEncodedDest}`
          );
          continue;
        }
        
        // Query database để lấy EntityAccountId
        const barPage = await barPageModel.getBarPageById(barPageId);
        
        if (barPage && barPage.EntityAccountId) {
          const profilePath = `/profile/${barPage.EntityAccountId}`;
          urlCache[barPageId] = profilePath;
          
          // Replace /bar/{BarPageId} bằng /profile/{EntityAccountId} trong decoded URL
          const newDecodedDest = decodedDest.replace(/\/bar\/[0-9A-F-]+/i, profilePath);
          const newEncodedDest = encodeURIComponent(newDecodedDest);
          
          // Replace trong HTML
          updatedHtml = updatedHtml.replace(
            new RegExp(`dest=${encodedDestValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
            `dest=${newEncodedDest}`
          );
          
          console.log(`[ReviveAdServerService] ✅ Converted dest parameter: /bar/${barPageId} -> ${profilePath}`);
        }
      } catch (error) {
        console.error(`[ReviveAdServerService] ❌ Error converting dest parameter:`, error);
      }
    }
    
    return updatedHtml;
  }

  /**
   * Lấy banner từ zone (Server-side)
   * Vì Revive zone dùng async JavaScript invocation code (asyncjs.php),
   * nên chúng ta cần dùng ajs.php để lấy banner HTML
   */
  async getBannerFromZone(zoneId, params = {}) {
    try {
      // Dùng ajs.php (async JavaScript) vì zone được cấu hình với async invocation code
      const deliveryUrl = `${this.baseUrl}/www/delivery/ajs.php`;
      
      // Thêm cache buster để tránh cache và đảm bảo luôn lấy banner mới
      const queryParams = new URLSearchParams({
        zoneid: zoneId,
        cb: Date.now(), // Cache buster - timestamp
        ...params
      });

      const fullUrl = `${deliveryUrl}?${queryParams.toString()}`;
      console.log(`[ReviveAdServerService] Fetching banner from: ${fullUrl}`);

      const response = await axios.get(fullUrl, {
        maxRedirects: 5, // Allow redirects (Revive may redirect to image URL)
        validateStatus: (status) => status >= 200 && status < 400,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'http://localhost:3000/', // Có thể cần Referer để Revive nhận diện đúng
          'Cache-Control': 'no-cache'
        },
        // Cho phép redirect đến image URL nếu Revive redirect
        followRedirect: true
      });

      console.log(`[ReviveAdServerService] Response status: ${response.status}`);
      console.log(`[ReviveAdServerService] Response type: ${typeof response.data}`);
      console.log(`[ReviveAdServerService] Response length: ${response.data ? (typeof response.data === 'string' ? response.data.length : 'object') : 'null'}`);
      console.log(`[ReviveAdServerService] Content-Type: ${response.headers['content-type'] || 'unknown'}`);

      // Handle different response types
      if (response.data) {
        // If response is a string (JavaScript code from ajs.php or HTML from ck.php)
        if (typeof response.data === 'string') {
          const contentType = response.headers['content-type'] || '';
          
          // Check if response is JavaScript (from ajs.php)
          if (contentType.includes('javascript') || response.data.trim().startsWith('var OX_')) {
            console.log(`[ReviveAdServerService] Received JavaScript response, parsing HTML from it...`);
            
            // Parse HTML from JavaScript: var OX_xxxxx = ''; OX_xxxxx += "<"+"a href=...
            // Revive uses "<"+"a to prevent browser parsing, need to handle this
            // Strategy: Extract all string literals after += and join them
            
            // Find all += statements and extract the concatenated strings
            // Pattern: OX_xxx += "string1" + "string2" + 'string3'
            const lines = response.data.split('\n');
            let htmlParts = [];
            
            for (const line of lines) {
              // Match lines like: OX_xxxxx += "..." or OX_xxxxx += '...'
              if (line.includes('+=')) {
                // Extract all string literals from this line
                // Match: "..." or '...' (handling escaped quotes)
                const stringMatches = line.matchAll(/(["'])((?:\\\1|(?!\1).)*?)\1/g);
                for (const match of stringMatches) {
                  htmlParts.push(match[2]);
                }
              }
            }
            
            if (htmlParts.length > 0) {
              // Join all parts and decode
              let html = htmlParts.join('')
                .replace(/\\\'/g, "'")           // Unescape single quotes: \' -> '
                .replace(/\\"/g, '"')            // Unescape double quotes: \" -> "
                .replace(/&amp;/g, '&')          // Decode HTML entities
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&nbsp;/g, ' ');
              
              if (html && html.trim().length > 0) {
                // Replace localhost URLs với production URL
                html = this.replaceLocalhostUrls(html);
                // Convert /bar/{BarPageId} URLs to /profile/{EntityAccountId}
                html = await this.convertBarUrlsInHtml(html);
                console.log(`[ReviveAdServerService] Successfully extracted HTML from JavaScript (${html.length} chars)`);
                return {
                  html: html.trim(),
                  zoneId: zoneId
                };
              }
            }
            
            // Fallback: try to extract HTML tag directly (if not obfuscated)
            const htmlTagMatch = response.data.match(/<a\s+[^>]*>.*?<\/a>/s);
            if (htmlTagMatch) {
              let html = htmlTagMatch[0]
                .replace(/\\\'/g, "'")
                .replace(/\\"/g, '"');
              // Replace localhost URLs với production URL
              html = this.replaceLocalhostUrls(html);
              // Convert /bar/{BarPageId} URLs to /profile/{EntityAccountId}
              html = await this.convertBarUrlsInHtml(html);
              console.log(`[ReviveAdServerService] Extracted HTML using fallback method (${html.length} chars)`);
              return {
                html: html,
                zoneId: zoneId
              };
            }
            
            console.warn(`[ReviveAdServerService] Could not parse HTML from JavaScript response`);
            console.warn(`[ReviveAdServerService] Response preview: ${response.data.substring(0, 500)}`);
          }
          
          // Check if response is empty or error message
          const trimmedData = response.data.trim();
          if (!trimmedData || trimmedData.length === 0) {
            console.warn(`[ReviveAdServerService] Empty response from Revive for zone ${zoneId}`);
            console.warn(`[ReviveAdServerService] Please check in Revive Admin Panel:`);
            console.warn(`  1. Campaigns → [Campaign Name] → Status must be 'Active'`);
            console.warn(`  2. Campaigns → [Campaign Name] → Start Date/End Date must include current date`);
            console.warn(`  3. Inventory → Banners → [Banner Name] → Banner Status must be 'Active'`);
            console.warn(`  4. Inventory → Zones → Zone ${zoneId} → Tab 'Linked Banners' → Must have banners linked`);
            console.warn(`  5. If Campaign type is 'Remnant', check Delivery Rules settings`);
            return null;
          }
          
          // Check for common error indicators
          if (trimmedData.includes('<!-- Error:') || 
              trimmedData.includes('No ads available') ||
              trimmedData.includes('<!-- No ads') ||
              trimmedData.toLowerCase().includes('no banner')) {
            console.warn(`[ReviveAdServerService] Revive returned error: ${trimmedData.substring(0, 200)}`);
            return null;
          }

          // Check if response is an image redirect (sometimes Revive returns image directly)
          if (contentType.startsWith('image/')) {
            // If Revive redirects to image, wrap it in an anchor tag
            const imageUrl = response.request.res.responseUrl || fullUrl;
        return {
              html: `<a href="${imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="Advertisement" style="max-width: 100%; height: auto;" /></a>`,
          zoneId: zoneId
        };
      }

          // If response is already HTML (from ck.php or other methods)
          if (trimmedData.startsWith('<')) {
            // Replace localhost URLs với production URL
            let html = this.replaceLocalhostUrls(response.data);
            // Convert /bar/{BarPageId} URLs to /profile/{EntityAccountId}
            html = await this.convertBarUrlsInHtml(html);
            console.log(`[ReviveAdServerService] Successfully retrieved banner HTML (${html.length} chars)`);
            return {
              html: html,
              zoneId: zoneId
            };
          }
        }
        
        // If response is an object (JSON) - shouldn't happen but handle it
        if (typeof response.data === 'object') {
          console.warn(`[ReviveAdServerService] Unexpected object response:`, JSON.stringify(response.data).substring(0, 200));
          return null;
        }
      }

      console.warn(`[ReviveAdServerService] No valid data in response`);
      console.warn(`[ReviveAdServerService] Response headers:`, JSON.stringify(response.headers, null, 2));
      return null;
    } catch (error) {
      console.error("[ReviveAdServerService] getBannerFromZone error:", {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: fullUrl,
        baseUrl: this.baseUrl,
        data: error.response?.data ? (typeof error.response.data === 'string' ? error.response.data.substring(0, 200) : JSON.stringify(error.response.data)) : null
      });
      
      // Log more details for debugging
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error(`[ReviveAdServerService] Connection error - Revive server may not be accessible at ${this.baseUrl}`);
        console.error(`[ReviveAdServerService] Please check REVIVE_AD_SERVER_URL environment variable`);
      }
      
      return null;
    }
  }

  /**
   * Lấy invocation code (JavaScript)
   */
  getInvocationCode(zoneId, params = {}) {
    const invocationUrl = `${this.baseUrl}/www/delivery/ajs.php`;
    const queryParams = new URLSearchParams({
      zoneid: zoneId,
      ...params
    });
    
    return {
      type: 'javascript',
      url: `${invocationUrl}?${queryParams.toString()}`,
      code: `<script type="text/javascript" src="${invocationUrl}?${queryParams.toString()}"></script>`
    };
  }

  /**
   * Query Revive database để lấy banner ID đang được serve cho zone
   * @param {string} zoneId - Zone ID
   * @returns {Promise<string|null>} Banner ID hoặc null
   */
  async getBannerIdFromZone(zoneId) {
    // Kiểm tra xem có config Revive DB không
    const reviveDbConfig = {
      host: process.env.REVIVE_DB_HOST,
      port: parseInt(process.env.REVIVE_DB_PORT || "3306"),
      user: process.env.REVIVE_DB_USER,
      password: process.env.REVIVE_DB_PASSWORD,
      database: process.env.REVIVE_DB_NAME || "revive",
    };

    if (!reviveDbConfig.host || !reviveDbConfig.user || !reviveDbConfig.password) {
      console.warn(`[ReviveAdServerService] Revive DB config not set, cannot query banner ID`);
      return null;
    }

    const mysql = require("mysql2/promise");
    let connection = null;

    try {
      const reviveDbSslEnabled = (() => {
        const v = process.env.REVIVE_DB_SSL;
        if (v === undefined || v === null || String(v).trim() === "") return false;
        return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
      })();

      connection = await mysql.createConnection({
        ...reviveDbConfig,
        ...(reviveDbSslEnabled ? { ssl: { rejectUnauthorized: false } } : {}),
      });
      
      // Query để lấy banner ID đang active cho zone
      // Revive lưu trong bảng ox_banners và ox_ad_zone_assoc
      // Hoặc có thể query từ ox_zones và ox_ad_zone_assoc
      const [rows] = await connection.execute(`
        SELECT b.bannerid
        FROM ox_banners b
        INNER JOIN ox_ad_zone_assoc aza ON b.bannerid = aza.ad_id
        INNER JOIN ox_zones z ON aza.zone_id = z.zoneid
        WHERE z.zoneid = ?
          AND b.status = 1
          AND b.type = 'html'
        ORDER BY b.updated DESC
        LIMIT 1
      `, [zoneId]);

      if (rows.length > 0) {
        const bannerId = rows[0].bannerid.toString();
        console.log(`[ReviveAdServerService] Found banner ID ${bannerId} for zone ${zoneId}`);
        return bannerId;
      }

      // Fallback: Thử query từ bảng khác nếu tên table khác
      const [fallbackRows] = await connection.execute(`
        SELECT bannerid
        FROM ox_banners
        WHERE zoneid = ?
          AND status = 1
        ORDER BY updated DESC
        LIMIT 1
      `, [zoneId]);

      if (fallbackRows.length > 0) {
        const bannerId = fallbackRows[0].bannerid.toString();
        console.log(`[ReviveAdServerService] Found banner ID ${bannerId} for zone ${zoneId} (fallback query)`);
        return bannerId;
      }

      console.warn(`[ReviveAdServerService] No active banner found for zone ${zoneId}`);
      return null;
    } catch (error) {
      console.error(`[ReviveAdServerService] Error querying banner ID from Revive DB:`, error.message);
      return null;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
}

module.exports = new ReviveAdServerService();