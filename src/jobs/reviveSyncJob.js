const cron = require('node-cron');
const reviveSyncService = require('../services/reviveSyncService');

/**
 * Background job để tự động sync stats từ Revive Ad Server
 * Chạy định kỳ để đồng bộ dữ liệu thống kê quảng cáo
 */
class ReviveSyncJob {
  static cronJob = null;
  static isRunning = false;

  /**
   * Khởi động cron job
   * @param {number} intervalMinutes - Số phút giữa mỗi lần sync (mặc định: 15 phút)
   */
  static start(intervalMinutes = 15) {
    if (this.cronJob) {
      console.log('[ReviveSyncJob] Job already started');
      return;
    }

    // Chuyển đổi intervalMinutes sang cron expression
    // Ví dụ: 15 phút = '*/15 * * * *'
    const cronExpression = `*/${intervalMinutes} * * * *`;

    console.log(`[ReviveSyncJob] Starting Revive sync job (every ${intervalMinutes} minutes)`);
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        console.log('[ReviveSyncJob] Previous sync still running, skipping this cycle');
        return;
      }

      try {
        this.isRunning = true;
        console.log('[ReviveSyncJob] Starting scheduled sync...');
        const startTime = Date.now();

        const result = await reviveSyncService.syncAllActiveAds();
        
        const duration = Date.now() - startTime;
        console.log(`[ReviveSyncJob] Sync completed in ${duration}ms. Synced ${result.synced} ads`);
      } catch (error) {
        console.error('[ReviveSyncJob] Error during scheduled sync:', error);
      } finally {
        this.isRunning = false;
      }
    }, {
      scheduled: true,
      timezone: "Asia/Ho_Chi_Minh"
    });

    // Chạy ngay lần đầu sau khi start
    setTimeout(async () => {
      try {
        console.log('[ReviveSyncJob] Running initial sync...');
        this.isRunning = true;
        const result = await reviveSyncService.syncAllActiveAds();
        console.log(`[ReviveSyncJob] Initial sync completed. Synced ${result.synced} ads`);
      } catch (error) {
        console.error('[ReviveSyncJob] Error during initial sync:', error);
      } finally {
        this.isRunning = false;
      }
    }, 5000); // Chờ 5 giây sau khi start để đảm bảo server đã sẵn sàng
  }

  /**
   * Dừng cron job
   */
  static stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[ReviveSyncJob] Job stopped');
    }
  }

  /**
   * Chạy sync ngay lập tức (manual trigger)
   */
  static async runNow() {
    if (this.isRunning) {
      throw new Error('Sync is already running');
    }

    try {
      this.isRunning = true;
      console.log('[ReviveSyncJob] Manual sync triggered');
      const startTime = Date.now();

      const result = await reviveSyncService.syncAllActiveAds();
      
      const duration = Date.now() - startTime;
      console.log(`[ReviveSyncJob] Manual sync completed in ${duration}ms. Synced ${result.synced} ads`);
      
      return result;
    } catch (error) {
      console.error('[ReviveSyncJob] Error during manual sync:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = ReviveSyncJob;

