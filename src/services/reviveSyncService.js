const axios = require("axios");
const mysql = require("mysql2/promise");
const userAdvertisementModel = require("../models/userAdvertisementModel");
const adSyncLogModel = require("../models/adSyncLogModel");
const { getPool, sql } = require("../db/sqlserver");

class ReviveSyncService {
  constructor() {
    this.baseUrl = process.env.REVIVE_AD_SERVER_URL || "http://localhost/revive";
    this.reviveDbConfig = null;
    
    // Initialize Revive database connection if configured
    if (process.env.REVIVE_DB_HOST) {
      // Toggle SSL via env:
      // - REVIVE_DB_SSL=1/true => enable SSL
      // - REVIVE_DB_SSL=0/false/empty => disable SSL (useful for localhost MySQL without SSL)
      const reviveDbSslEnabled = (() => {
        const v = process.env.REVIVE_DB_SSL;
        if (v === undefined || v === null || String(v).trim() === "") return false;
        return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
      })();

      this.reviveDbConfig = {
        host: process.env.REVIVE_DB_HOST,
        port: parseInt(process.env.REVIVE_DB_PORT || "3306"),
        user: process.env.REVIVE_DB_USER,
        password: process.env.REVIVE_DB_PASSWORD,
        database: process.env.REVIVE_DB_NAME || "revive",
        connectionLimit: 5,
        connectTimeout: 10000,
        ...(reviveDbSslEnabled
          ? {
              // Azure MySQL yêu cầu SSL nhưng có thể không cần verify certificate (tùy môi trường)
              ssl: { rejectUnauthorized: false },
            }
          : {}),
      };
    }
    
    this.adminUsername = process.env.REVIVE_ADMIN_USERNAME || "";
    this.adminPassword = process.env.REVIVE_ADMIN_PASSWORD || "";
  }

  /**
   * Normalize bannerId - convert to number if possible, otherwise keep as string
   * Revive thường lưu ad_id là INT, nên cần normalize
   */
  normalizeBannerId(bannerId) {
    if (!bannerId && bannerId !== 0) return null; // Allow 0 as valid bannerId
    
    // Convert to string first để trim whitespace
    const str = String(bannerId).trim();
    if (str === '') return null;
    
    // Thử parse thành số (bao gồm cả "03" -> 3)
    const num = parseInt(str, 10);
    const isNumeric = !isNaN(num) && !isNaN(str);
    
    if (isNumeric) {
      // Trả về cả số và string gốc (vì có thể Revive lưu dạng string "03")
      // Nhưng ưu tiên số vì Revive thường dùng INT
      return { 
        asString: str, 
        asNumber: num, 
        original: bannerId,
        // Nếu string có leading zero như "03", vẫn thử cả hai
        tryBoth: String(num) !== str
      };
    }
    
    return { asString: str, asNumber: null, original: bannerId, tryBoth: false };
  }

  /**
   * Lấy stats từ Revive Ad Server cho một banner
   * Ưu tiên: Query database trực tiếp > XML-RPC API > Web scraping
   */
  async getBannerStats(bannerId, startDate = null, endDate = null) {
    try {
      // Normalize bannerId
      const normalized = this.normalizeBannerId(bannerId);
      if (!normalized) {
        console.warn(`[ReviveSyncService] Invalid bannerId: ${bannerId}`);
        return null;
      }
      
      console.log(`[ReviveSyncService] Getting stats for banner ${bannerId} (normalized: string="${normalized.asString}", number=${normalized.asNumber || 'N/A'})`);
      
      // Method 1: Query Revive database trực tiếp (fastest & most reliable)
      if (this.reviveDbConfig) {
        try {
          // Thử với number trước (vì Revive thường lưu INT), sau đó thử string
          const bannerIdToTry = normalized.asNumber !== null ? normalized.asNumber : normalized.asString;
          const stats = await this.getBannerStatsFromDB(bannerIdToTry, startDate, endDate);
          if (stats) {
            console.log(`[ReviveSyncService] Got stats from DB for banner ${bannerId}:`, stats);
            return stats;
          }
          
          // Nếu number không work và có cả hai, thử string
          if (normalized.asNumber !== null && normalized.asNumber !== normalized.asString) {
            console.log(`[ReviveSyncService] Retrying with string version: "${normalized.asString}"`);
            const statsStr = await this.getBannerStatsFromDB(normalized.asString, startDate, endDate);
            if (statsStr) {
              console.log(`[ReviveSyncService] Got stats from DB (string version) for banner ${bannerId}:`, statsStr);
              return statsStr;
            }
          }
        } catch (dbError) {
          // Log chi tiết hơn về lỗi kết nối
          if (dbError.code === 'ECONNREFUSED') {
            console.warn(`[ReviveSyncService] DB connection refused. Check if MySQL server is running at ${this.reviveDbConfig.host}:${this.reviveDbConfig.port}`);
            console.warn(`[ReviveSyncService] DB query failed, trying alternative method`);
          } else {
            console.warn(`[ReviveSyncService] DB query failed, trying alternative method:`, dbError.message);
          }
        }
      }
      
      // Method 2: XML-RPC API (nếu enabled)
      if (process.env.REVIVE_XMLRPC_URL) {
        try {
          const stats = await this.getBannerStatsFromXMLRPC(bannerId, startDate, endDate);
          if (stats) {
            console.log(`[ReviveSyncService] Got stats from XML-RPC for banner ${bannerId}:`, stats);
            return stats;
          }
        } catch (xmlrpcError) {
          console.warn(`[ReviveSyncService] XML-RPC failed, trying scraping:`, xmlrpcError.message);
        }
      }
      
      // Method 3: Web scraping từ statistics page (slowest, requires credentials)
      if (this.adminUsername && this.adminPassword) {
        try {
          const stats = await this.getBannerStatsFromScraping(bannerId, startDate, endDate);
          if (stats) {
            console.log(`[ReviveSyncService] Got stats from scraping for banner ${bannerId}:`, stats);
            return stats;
          }
        } catch (scrapingError) {
          console.warn(`[ReviveSyncService] Scraping failed:`, scrapingError.message);
        }
      }
      
      // Fallback: Return zero stats if all methods fail
      console.warn(`[ReviveSyncService] All methods failed for banner ${bannerId}`);
      console.warn(`[ReviveSyncService] Configuration check:`);
      console.warn(`  - REVIVE_DB_HOST: ${process.env.REVIVE_DB_HOST ? '✅ Set' : '❌ Not set'}`);
      console.warn(`  - REVIVE_XMLRPC_URL: ${process.env.REVIVE_XMLRPC_URL ? '✅ Set' : '❌ Not set'}`);
      console.warn(`  - REVIVE_ADMIN_USERNAME: ${process.env.REVIVE_ADMIN_USERNAME ? '✅ Set' : '❌ Not set'}`);
      console.warn(`[ReviveSyncService] Returning zero stats - configure Revive connection in .env`);
      
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        ctr: 0
      };
    } catch (error) {
      console.error("[ReviveSyncService] Error fetching banner stats:", error);
      return null;
    }
  }

  /**
   * Tự động detect table name trong Revive database
   */
  async detectStatsTableName(connection) {
    try {
      // Liệt kê tất cả tables trong database
      const [tables] = await connection.execute(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE '%data%' 
        AND (TABLE_NAME LIKE '%banner%' OR TABLE_NAME LIKE '%summary%' OR TABLE_NAME LIKE '%daily%' OR TABLE_NAME LIKE '%hourly%' OR TABLE_NAME LIKE '%intermediate%')
        ORDER BY TABLE_NAME
      `);

      console.log(`[ReviveSyncService] Found ${tables.length} potential stats tables:`, tables.map(t => t.TABLE_NAME));

      // Thứ tự ưu tiên các table names
      // Ưu tiên intermediate table trước (bucket-based logging, có data trực tiếp)
      // Sau đó mới đến summary tables (nếu maintenance đã chạy)
      const preferredTables = [
        'rv_data_intermediate_ad',      // ƯU TIÊN CAO - Bucket-based logging (có data trực tiếp)
        'ox_data_intermediate_ad',      // Legacy intermediate table
        'rv_data_summary_ad_daily',     // Summary tables (nếu maintenance đã chạy)
        'rv_data_summary_ad_hourly',    // Revive 5.x (prefix rv_)
        'ox_data_summary_ad_daily',     // Revive 4.x (prefix ox_)
        'ox_data_banner_daily',
        'rv_data_summary_ad_zone_assoc',
        'ox_data_summary_ad_hourly',
        'ox_data_banner_hourly',
        'ox_data_summary_ad_zone_daily',
        'ox_data_banner_summary'
      ];

      // Tìm table có trong danh sách preferred
      for (const preferredName of preferredTables) {
        const found = tables.find(t => t.TABLE_NAME === preferredName || t.TABLE_NAME.toLowerCase() === preferredName.toLowerCase());
        if (found) {
          console.log(`[ReviveSyncService] Using stats table: ${found.TABLE_NAME}`);
          return found.TABLE_NAME;
        }
      }

      // Nếu không tìm thấy, lấy table đầu tiên
      if (tables.length > 0) {
        console.log(`[ReviveSyncService] Using first available stats table: ${tables[0].TABLE_NAME}`);
        return tables[0].TABLE_NAME;
      }

      return null;
    } catch (error) {
      console.warn(`[ReviveSyncService] Error detecting table name:`, error.message);
      return null;
    }
  }

  /**
   * Method 1: Query stats từ Revive database trực tiếp
   * Revive lưu stats trong các bảng khác nhau tùy version/config
   * Tự động detect table name
   */
  async getBannerStatsFromDB(bannerId, startDate = null, endDate = null) {
    if (!this.reviveDbConfig) {
      return null;
    }

    // Kiểm tra cấu hình đầy đủ trước khi kết nối
    if (!this.reviveDbConfig.host || !this.reviveDbConfig.user || !this.reviveDbConfig.password) {
      console.warn(`[ReviveSyncService] Revive DB config incomplete. Missing: ${!this.reviveDbConfig.host ? 'host' : ''} ${!this.reviveDbConfig.user ? 'user' : ''} ${!this.reviveDbConfig.password ? 'password' : ''}`);
      return null;
    }

    let connection = null;
    try {
      connection = await mysql.createConnection(this.reviveDbConfig);
      
      // Tự động detect table name (ưu tiên intermediate table)
      const tableName = await this.detectStatsTableName(connection);
      if (!tableName) {
        console.warn(`[ReviveSyncService] No stats table found via auto-detect. Trying fallback tables...`);
        // Thử các tên table phổ biến nhất, ưu tiên intermediate trước
        const fallbackTables = [
          'rv_data_intermediate_ad',      // Ưu tiên - bucket-based logging
          'ox_data_intermediate_ad',      // Legacy intermediate
          'rv_data_summary_ad_daily',     // Summary tables
          'rv_data_summary_ad_hourly',
          'ox_data_summary_ad_daily',
          'ox_data_banner_daily',
          'ox_data_summary_ad_hourly'
        ];
        
        for (const fallbackTable of fallbackTables) {
          try {
            console.log(`[ReviveSyncService] Trying fallback table: ${fallbackTable}`);
            const stats = await this.queryStatsFromTable(connection, fallbackTable, bannerId, startDate, endDate);
            if (stats !== null) {
              console.log(`[ReviveSyncService] ✅ Successfully queried from fallback table: ${fallbackTable}`);
              return stats;
            }
          } catch (err) {
            // Table không tồn tại hoặc query failed, thử table tiếp theo
            console.log(`[ReviveSyncService] Fallback table ${fallbackTable} failed:`, err.message);
            continue;
          }
        }
        
        throw new Error('No valid stats table found. Please check Revive database structure.');
      }

      // Query từ table đã detect
      const stats = await this.queryStatsFromTable(connection, tableName, bannerId, startDate, endDate);
      
      // Nếu table detected là summary nhưng không có data, thử intermediate table
      if (!stats && (tableName.includes('summary') || tableName.includes('hourly') || tableName.includes('daily'))) {
        console.log(`[ReviveSyncService] No data in summary table ${tableName}, trying intermediate table...`);
        const intermediateTables = ['rv_data_intermediate_ad', 'ox_data_intermediate_ad'];
        for (const intermediateTable of intermediateTables) {
          try {
            const intermediateStats = await this.queryStatsFromTable(connection, intermediateTable, bannerId, startDate, endDate);
            if (intermediateStats !== null) {
              console.log(`[ReviveSyncService] ✅ Got stats from intermediate table: ${intermediateTable}`);
              return intermediateStats;
            }
          } catch (intermediateErr) {
            continue;
          }
        }
      }
      
      return stats;
    } catch (error) {
      console.error("[ReviveSyncService] DB query error:", error);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * Query stats từ một table cụ thể
   */
  async queryStatsFromTable(connection, tableName, bannerId, startDate = null, endDate = null) {
    try {
      console.log(`[ReviveSyncService] Querying table ${tableName} for bannerId: ${bannerId} (type: ${typeof bannerId})`);
      
      // Kiểm tra xem table có tồn tại và có data không
      try {
        const [countRows] = await connection.execute(`SELECT COUNT(*) as total FROM ${tableName}`);
        console.log(`[ReviveSyncService] Table ${tableName} has ${countRows[0]?.total || 0} total rows`);
      } catch (countErr) {
        console.warn(`[ReviveSyncService] Could not count rows in ${tableName}:`, countErr.message);
      }
      
      // Kiểm tra structure của table để tìm đúng column names
      try {
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME, DATA_TYPE 
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION
        `, [tableName]);
        
        console.log(`[ReviveSyncService] Table ${tableName} columns:`, columns.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`).join(', '));
        
        // Tìm column chứa banner ID (có thể là ad_id, bannerid, banner_id, etc.)
        // Intermediate table dùng 'ad_id', summary tables có thể dùng 'ad_id' hoặc 'bannerid'
        const idColumns = columns.filter(c => {
          const colLower = c.COLUMN_NAME.toLowerCase();
          return colLower === 'ad_id' ||  // Ưu tiên ad_id (intermediate table)
                 colLower.includes('ad_id') || 
                 (colLower.includes('banner') && colLower.includes('id'));
        });
        
        // Sắp xếp để ưu tiên 'ad_id' trước (intermediate table)
        idColumns.sort((a, b) => {
          const aLower = a.COLUMN_NAME.toLowerCase();
          const bLower = b.COLUMN_NAME.toLowerCase();
          if (aLower === 'ad_id') return -1;
          if (bLower === 'ad_id') return 1;
          return 0;
        });
        
        // Tìm column chứa date
        const dateColumns = columns.filter(c => 
          c.COLUMN_NAME.toLowerCase().includes('date') || 
          c.COLUMN_NAME.toLowerCase().includes('day') ||
          c.COLUMN_NAME.toLowerCase().includes('time')
        );
        
        // Tìm column chứa revenue (có thể là revenue, total_revenue, cost, total_cost)
        const revenueColumns = columns.filter(c => 
          c.COLUMN_NAME.toLowerCase().includes('revenue') || 
          c.COLUMN_NAME.toLowerCase().includes('cost')
        );
        
        // Ưu tiên total_revenue > revenue > total_cost > cost
        const revenueColumn = revenueColumns.find(c => c.COLUMN_NAME.toLowerCase() === 'total_revenue') ||
                             revenueColumns.find(c => c.COLUMN_NAME.toLowerCase() === 'revenue') ||
                             revenueColumns.find(c => c.COLUMN_NAME.toLowerCase() === 'total_cost') ||
                             revenueColumns.find(c => c.COLUMN_NAME.toLowerCase() === 'cost') ||
                             (revenueColumns.length > 0 ? revenueColumns[0] : null);
        
        console.log(`[ReviveSyncService] Found ID columns:`, idColumns.map(c => c.COLUMN_NAME).join(', '));
        console.log(`[ReviveSyncService] Found date columns:`, dateColumns.map(c => c.COLUMN_NAME).join(', '));
        console.log(`[ReviveSyncService] Found revenue columns:`, revenueColumns.map(c => c.COLUMN_NAME).join(', '));
        console.log(`[ReviveSyncService] Using revenue column:`, revenueColumn?.COLUMN_NAME || 'none (will use 0)');
        
        // Thử các combination của id và date columns
        const columnVariations = [];
        
        if (idColumns.length > 0 && dateColumns.length > 0) {
          for (const idCol of idColumns) {
            for (const dateCol of dateColumns) {
              columnVariations.push({ 
                id: idCol.COLUMN_NAME, 
                date: dateCol.COLUMN_NAME,
                revenue: revenueColumn?.COLUMN_NAME || null
              });
            }
          }
        } else {
          // Fallback to default variations
          columnVariations.push(
            // revenue: null => query will use 0 AS total_revenue
            { id: 'ad_id', date: 'date_time', revenue: revenueColumn?.COLUMN_NAME || null },
            { id: 'bannerid', date: 'day', revenue: revenueColumn?.COLUMN_NAME || null },
            { id: 'banner_id', date: 'date_time', revenue: revenueColumn?.COLUMN_NAME || null }
          );
        }
        
        console.log(`[ReviveSyncService] Trying ${columnVariations.length} column combinations...`);
        
        for (const cols of columnVariations) {
          try {
            // Kiểm tra xem columns có tồn tại không
            const idColExists = columns.find(c => c.COLUMN_NAME.toLowerCase() === cols.id.toLowerCase());
            const dateColExists = columns.find(c => c.COLUMN_NAME.toLowerCase() === cols.date.toLowerCase());
            
            if (!idColExists) {
              console.log(`[ReviveSyncService] Column ${cols.id} does not exist in ${tableName}, skipping...`);
              continue;
            }
            
            // Normalize bannerId và thử cả số và string
            // Revive thường lưu ad_id là INT, nên ưu tiên number
            const normalized = this.normalizeBannerId(bannerId);
            if (!normalized) {
              console.log(`[ReviveSyncService] Invalid bannerId: ${bannerId}, skipping...`);
              continue;
            }
            
            const bannerIdVariations = [];
            
            // Ưu tiên số nếu có (vì Revive thường dùng INT)
            if (normalized.asNumber !== null) {
              bannerIdVariations.push({ value: normalized.asNumber, type: 'number', priority: 1 });
              // Nếu string khác number (ví dụ "03" vs 3), cũng thử string
              if (normalized.tryBoth || normalized.asString !== String(normalized.asNumber)) {
                bannerIdVariations.push({ value: normalized.asString, type: 'string', priority: 2 });
              }
            } else {
              // Nếu không phải số, chỉ thử string
              bannerIdVariations.push({ value: normalized.asString, type: 'string', priority: 1 });
            }
            
            // Sắp xếp theo priority (number trước)
            bannerIdVariations.sort((a, b) => a.priority - b.priority);
            
            for (const variation of bannerIdVariations) {
              const bannerIdValue = variation.value;
              try {
                // Kiểm tra xem có data cho bannerId này không
                const checkQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${cols.id} = ?`;
                const [checkRows] = await connection.execute(checkQuery, [bannerIdValue]);
                
                if (checkRows[0]?.count > 0) {
                  console.log(`[ReviveSyncService] ✅ Found ${checkRows[0].count} rows with ${cols.id} = ${bannerIdValue} (type: ${variation.type})`);
                } else {
                  console.log(`[ReviveSyncService] ⚠️  No rows found with ${cols.id} = ${bannerIdValue} (type: ${variation.type})`);
                  
                  // Debug: List một vài giá trị bannerId có trong table (chỉ lần đầu)
                  if (variation.priority === 1) {
                    try {
                      const [sampleRows] = await connection.execute(`SELECT DISTINCT ${cols.id} FROM ${tableName} ORDER BY ${cols.id} LIMIT 10`);
                      const sampleValues = sampleRows.map(r => r[cols.id]);
                      console.log(`[ReviveSyncService] Sample ${cols.id} values in table (first 10):`, sampleValues);
                      
                      // Kiểm tra xem bannerId có trong sample không (case-insensitive)
                      const foundInSample = sampleValues.some(v => {
                        const vStr = String(v).trim();
                        const bannerIdStr = String(bannerId).trim();
                        return vStr === bannerIdStr || String(parseInt(vStr)) === String(parseInt(bannerIdStr));
                      });
                      
                      if (!foundInSample && sampleValues.length > 0) {
                        console.log(`[ReviveSyncService] ⚠️  BannerId ${bannerId} not found in sample. Possible mismatch in data type or value.`);
                      }
                    } catch (sampleErr) {
                      // Ignore sample query errors
                    }
                  }
                }
                
                // Use detected revenue/cost column if available; otherwise default to 0
                const revenueCol = cols.revenue || null;

                const revenueSelect = revenueCol
                  ? `SUM(COALESCE(\`${revenueCol}\`, 0)) AS total_revenue`
                  : `0 AS total_revenue`;

                let query = `
                  SELECT 
                    SUM(impressions) AS total_impressions,
                    SUM(clicks) AS total_clicks,
                    ${revenueSelect}
                  FROM ${tableName}
                  WHERE \`${cols.id}\` = ?
                `;
                
                const params = [bannerIdValue];
                
                if (startDate && dateColExists) {
                  query += ` AND ${cols.date} >= ?`;
                  params.push(startDate);
                }
                if (endDate && dateColExists) {
                  query += ` AND ${cols.date} <= ?`;
                  params.push(endDate);
                }
                
                const [rows] = await connection.execute(query, params);
                
                if (rows.length > 0) {
                  const row = rows[0];
                  const impressions = parseInt(row.total_impressions || 0);
                  const clicks = parseInt(row.total_clicks || 0);
                  const revenue = parseFloat(row.total_revenue || 0);
                  const ctr = impressions > 0 ? (clicks / impressions * 100) : 0;
                  
                  // Return stats ngay cả khi = 0 (vì đó vẫn là kết quả hợp lệ - banner chưa có impression/clicks)
                  // Nhưng chỉ return từ variation đầu tiên (priority 1) để tránh duplicate
                  // Nếu là intermediate table và có data (impressions > 0 hoặc clicks > 0), return ngay
                  const hasData = impressions > 0 || clicks > 0;
                  const isIntermediate = tableName.toLowerCase().includes('intermediate');
                  
                  if (variation.priority === 1 || (isIntermediate && hasData)) {
                    console.log(`[ReviveSyncService] ✅ Successfully queried stats from ${tableName} using ${cols.id}=${bannerIdValue} (${variation.type}): impressions=${impressions}, clicks=${clicks}, revenue=${revenue}`);
                    
                    return {
                      impressions,
                      clicks,
                      spend: revenue,
                      ctr: parseFloat(ctr.toFixed(2))
                    };
                  }
                } else {
                  console.log(`[ReviveSyncService] Query returned 0 rows for ${cols.id}=${bannerIdValue} (${variation.type})`);
                }
              } catch (queryErr) {
                console.log(`[ReviveSyncService] Query failed for ${cols.id}=${bannerIdValue} (${variation.type}):`, queryErr.message);
                // Continue to next variation
              }
            }
          } catch (colError) {
            console.log(`[ReviveSyncService] Error trying columns ${cols.id}, ${cols.date}:`, colError.message);
            continue;
          }
        }
      } catch (structureErr) {
        console.warn(`[ReviveSyncService] Could not check table structure:`, structureErr.message);
        // Fallback to default variations
      }

      console.warn(`[ReviveSyncService] ⚠️  No stats found in ${tableName} for bannerId ${bannerId}`);
      return null;
    } catch (error) {
      console.error(`[ReviveSyncService] Error querying table ${tableName}:`, error.message);
      throw error;
    }
  }

  /**
   * Method 2: Lấy stats qua XML-RPC API
   */
  async getBannerStatsFromXMLRPC(bannerId, startDate = null, endDate = null) {
    // TODO: Implement XML-RPC call if Revive XML-RPC is enabled
    // Revive XML-RPC API: https://documentation.revive-adserver.com/display/DOCS/XML-RPC+API
    // Requires: REVIVE_XMLRPC_URL, REVIVE_XMLRPC_USERNAME, REVIVE_XMLRPC_PASSWORD
    return null;
  }

  /**
   * Method 3: Scrape stats từ statistics page
   */
  async getBannerStatsFromScraping(bannerId, startDate = null, endDate = null) {
    // TODO: Implement web scraping if needed
    // Requires: Login to Revive admin panel, then scrape statistics-banner.php
    // This is complex and not recommended - prefer DB query or XML-RPC
    return null;
  }

  /**
   * Sync stats cho một ad từ Revive
   */
  async syncAdStats(userAdId) {
    try {
      const ad = await userAdvertisementModel.findById(userAdId);
      if (!ad || !ad.ReviveBannerId) {
        console.warn(`[ReviveSyncService] Ad ${userAdId} không có ReviveBannerId`);
        return null;
      }

      // Lấy stats từ Revive
      console.log(`[ReviveSyncService] Fetching stats from Revive for banner ${ad.ReviveBannerId} (ad ${userAdId})`);
      const stats = await this.getBannerStats(ad.ReviveBannerId);
      
      if (!stats) {
        console.warn(`[ReviveSyncService] No stats returned from Revive for banner ${ad.ReviveBannerId}`);
        return null;
      }

      console.log(`[ReviveSyncService] Stats from Revive for banner ${ad.ReviveBannerId}:`, {
        impressions: stats.impressions,
        clicks: stats.clicks,
        spend: stats.spend
      });

      // Tính CTR
      const ctr = stats.impressions > 0 
        ? (stats.clicks / stats.impressions * 100) 
        : 0;

      // Update ad stats
      const updatedAd = await userAdvertisementModel.updateAdStatus(userAdId, {
        totalImpressions: stats.impressions,
        totalClicks: stats.clicks,
        totalSpent: stats.spend
      });

      if (!updatedAd) {
        console.warn(`[ReviveSyncService] Warning: updateAdStatus returned null for ad ${userAdId}`);
      } else {
        console.log(`[ReviveSyncService] Updated ad ${userAdId} in DB: TotalImpressions=${updatedAd.TotalImpressions}, TotalClicks=${updatedAd.TotalClicks}, TotalSpent=${updatedAd.TotalSpent}`);
      }

      // Lưu sync log
      await adSyncLogModel.createSyncLog({
        userAdId,
        reviveBannerId: ad.ReviveBannerId,
        impressions: stats.impressions,
        clicks: stats.clicks,
        spend: stats.spend,
        ctr: parseFloat(ctr.toFixed(2)),
        syncType: 'stats',
        syncStatus: 'success'
      });

      return stats;
    } catch (error) {
      console.error(`[ReviveSyncService] Error syncing stats for ad ${userAdId}:`, error);
      
      // Log error
      try {
        const ad = await userAdvertisementModel.findById(userAdId);
        if (ad && ad.ReviveBannerId) {
          await adSyncLogModel.createSyncLog({
            userAdId,
            reviveBannerId: ad.ReviveBannerId,
            syncType: 'stats',
            syncStatus: 'failed',
            errorMessage: error.message
          });
        }
      } catch (logError) {
        console.error("[ReviveSyncService] Failed to log error:", logError);
      }
      
      return null;
    }
  }

  /**
   * Sync tất cả active/approved ads có ReviveBannerId
   */
  async syncAllActiveAds() {
    try {
      const pool = await getPool();
      // Sync cả ads có status 'active' và 'approved' (vì approved ads cũng có thể đang chạy trên Revive)
      const result = await pool.request().query(`
        SELECT UserAdId, ReviveBannerId, Status, Title
        FROM UserAdvertisements
        WHERE (Status = 'active' OR Status = 'approved') 
          AND ReviveBannerId IS NOT NULL 
          AND ReviveBannerId != ''
      `);

      if (result.recordset.length === 0) {
        console.log(`[ReviveSyncService] No ads found to sync (need: status='active' or 'approved', and ReviveBannerId IS NOT NULL)`);
        return { synced: 0, failed: 0, total: 0 };
      }

      console.log(`[ReviveSyncService] Found ${result.recordset.length} ads to sync:`);
      result.recordset.forEach(ad => {
        console.log(`  - Ad ${ad.UserAdId} (${ad.Status}): BannerId=${ad.ReviveBannerId}, Title="${ad.Title}"`);
      });

      let syncedCount = 0;
      let failedCount = 0;

      const syncPromises = result.recordset.map(async (ad) => {
        try {
          const stats = await this.syncAdStats(ad.UserAdId);
          if (stats) {
            syncedCount++;
            console.log(`[ReviveSyncService] ✅ Successfully synced ad ${ad.UserAdId}: impressions=${stats.impressions}, clicks=${stats.clicks}, spend=${stats.spend}`);
            return { success: true, adId: ad.UserAdId, stats };
          } else {
            failedCount++;
            console.warn(`[ReviveSyncService] ⚠️ No stats returned for ad ${ad.UserAdId}`);
            return { success: false, adId: ad.UserAdId, reason: 'no_stats' };
          }
        } catch (err) {
          failedCount++;
          console.error(`[ReviveSyncService] ❌ Failed to sync ad ${ad.UserAdId}:`, err.message);
          return { success: false, adId: ad.UserAdId, error: err.message };
        }
      });

      const results = await Promise.all(syncPromises);
      
      console.log(`[ReviveSyncService] Sync completed: ${syncedCount} successful, ${failedCount} failed out of ${result.recordset.length} total`);
      
      return { 
        synced: syncedCount, 
        failed: failedCount,
        total: result.recordset.length,
        results: results
      };
    } catch (error) {
      console.error("[ReviveSyncService] Error syncing all active ads:", error);
      throw error;
    }
  }
}

module.exports = new ReviveSyncService();


