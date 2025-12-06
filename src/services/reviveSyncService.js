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
      this.reviveDbConfig = {
        host: process.env.REVIVE_DB_HOST,
        port: parseInt(process.env.REVIVE_DB_PORT || "3306"),
        user: process.env.REVIVE_DB_USER,
        password: process.env.REVIVE_DB_PASSWORD,
        database: process.env.REVIVE_DB_NAME || "revive",
        connectionLimit: 5,
        connectTimeout: 10000,
        // Thêm SSL configuration cho Azure MySQL
        ssl: {
          rejectUnauthorized: false  // Azure MySQL yêu cầu SSL nhưng không cần verify certificate
        }
      };
    }
    
    this.adminUsername = process.env.REVIVE_ADMIN_USERNAME || "";
    this.adminPassword = process.env.REVIVE_ADMIN_PASSWORD || "";
  }

  /**
   * Lấy stats từ Revive Ad Server cho một banner
   * Ưu tiên: Query database trực tiếp > XML-RPC API > Web scraping
   */
  async getBannerStats(bannerId, startDate = null, endDate = null) {
    try {
      console.log(`[ReviveSyncService] Getting stats for banner ${bannerId}`);
      
      // Method 1: Query Revive database trực tiếp (fastest & most reliable)
      if (this.reviveDbConfig) {
        try {
          const stats = await this.getBannerStatsFromDB(bannerId, startDate, endDate);
          if (stats) {
            console.log(`[ReviveSyncService] Got stats from DB for banner ${bannerId}:`, stats);
            return stats;
          }
        } catch (dbError) {
          console.warn(`[ReviveSyncService] DB query failed, trying alternative method:`, dbError.message);
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
        AND (TABLE_NAME LIKE '%banner%' OR TABLE_NAME LIKE '%summary%' OR TABLE_NAME LIKE '%daily%' OR TABLE_NAME LIKE '%hourly%')
        ORDER BY TABLE_NAME
      `);

      console.log(`[ReviveSyncService] Found ${tables.length} potential stats tables:`, tables.map(t => t.TABLE_NAME));

      // Thứ tự ưu tiên các table names
      // Revive có thể dùng prefix 'ox_' hoặc 'rv_' tùy version
      const preferredTables = [
        'rv_data_summary_ad_hourly',    // Revive 5.x (prefix rv_)
        'rv_data_summary_ad_daily',
        'ox_data_summary_ad_daily',     // Revive 4.x (prefix ox_)
        'ox_data_banner_daily',
        'rv_data_summary_ad_zone_assoc',
        'ox_data_summary_ad_hourly',
        'ox_data_banner_hourly',
        'ox_data_summary_ad_zone_daily',
        'ox_data_banner_summary',
        'ox_data_intermediate_ad'
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

    let connection = null;
    try {
      connection = await mysql.createConnection(this.reviveDbConfig);
      
      // Tự động detect table name
      const tableName = await this.detectStatsTableName(connection);
      if (!tableName) {
        console.warn(`[ReviveSyncService] No stats table found in database. Please check your Revive installation.`);
        // Thử các tên table phổ biến nhất
        const fallbackTables = ['ox_data_summary_ad_daily', 'ox_data_banner_daily', 'ox_data_summary_ad_hourly'];
        
        for (const fallbackTable of fallbackTables) {
          try {
            console.log(`[ReviveSyncService] Trying fallback table: ${fallbackTable}`);
            const stats = await this.queryStatsFromTable(connection, fallbackTable, bannerId, startDate, endDate);
            if (stats !== null) {
              return stats;
            }
          } catch (err) {
            // Table không tồn tại, thử table tiếp theo
            continue;
          }
        }
        
        throw new Error('No valid stats table found. Please check Revive database structure.');
      }

      return await this.queryStatsFromTable(connection, tableName, bannerId, startDate, endDate);
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
        const idColumns = columns.filter(c => 
          c.COLUMN_NAME.toLowerCase().includes('ad_id') || 
          c.COLUMN_NAME.toLowerCase().includes('banner') && c.COLUMN_NAME.toLowerCase().includes('id')
        );
        
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
            { id: 'ad_id', date: 'date_time', revenue: revenueColumn?.COLUMN_NAME || 'total_revenue' },
            { id: 'bannerid', date: 'day', revenue: revenueColumn?.COLUMN_NAME || 'total_revenue' },
            { id: 'banner_id', date: 'date_time', revenue: revenueColumn?.COLUMN_NAME || 'total_revenue' }
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
            
            // Thử query với bannerId dạng string và int
            const bannerIdVariations = [bannerId];
            if (typeof bannerId === 'string' && !isNaN(parseInt(bannerId))) {
              bannerIdVariations.push(parseInt(bannerId));
            } else if (typeof bannerId === 'number') {
              bannerIdVariations.push(String(bannerId));
            }
            
            for (const bannerIdValue of bannerIdVariations) {
              try {
                // Kiểm tra xem có data cho bannerId này không
                const checkQuery = `SELECT COUNT(*) as count FROM ${tableName} WHERE ${cols.id} = ?`;
                const [checkRows] = await connection.execute(checkQuery, [bannerIdValue]);
                
                if (checkRows[0]?.count > 0) {
                  console.log(`[ReviveSyncService] ✅ Found ${checkRows[0].count} rows with ${cols.id} = ${bannerIdValue} (type: ${typeof bannerIdValue})`);
                } else {
                  console.log(`[ReviveSyncService] ⚠️  No rows found with ${cols.id} = ${bannerIdValue} (type: ${typeof bannerIdValue})`);
                  
                  // Debug: List một vài giá trị bannerId có trong table
                  try {
                    const [sampleRows] = await connection.execute(`SELECT DISTINCT ${cols.id} FROM ${tableName} LIMIT 10`);
                    console.log(`[ReviveSyncService] Sample ${cols.id} values in table:`, sampleRows.map(r => r[cols.id]));
                  } catch (sampleErr) {
                    // Ignore sample query errors
                  }
                }
                
                // Dùng revenue column đã detect (hoặc fallback nếu không có)
                const revenueCol = cols.revenue || 'total_revenue';
                
                let query = `
                  SELECT 
                    SUM(impressions) AS total_impressions,
                    SUM(clicks) AS total_clicks,
                    SUM(COALESCE(\`${revenueCol}\`, 0)) AS total_revenue
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
                  
                  console.log(`[ReviveSyncService] ✅ Successfully queried stats from ${tableName} using ${cols.id}=${bannerIdValue}, ${cols.date}: impressions=${impressions}, clicks=${clicks}, revenue=${revenue}`);
                  
                  return {
                    impressions,
                    clicks,
                    spend: revenue,
                    ctr: parseFloat(ctr.toFixed(2))
                  };
                }
              } catch (queryErr) {
                console.log(`[ReviveSyncService] Query failed for ${cols.id}=${bannerIdValue}:`, queryErr.message);
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


