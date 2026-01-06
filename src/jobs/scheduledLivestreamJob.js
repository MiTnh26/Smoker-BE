const cron = require('node-cron');
const livestreamService = require('../services/livestreamService');

/**
 * Background job để tự động kích hoạt scheduled livestreams
 * Chạy mỗi phút để kiểm tra và kích hoạt các livestreams đã đến giờ
 */
class ScheduledLivestreamJob {
  static cronJob = null;
  static isRunning = false;

  /**
   * Khởi động cron job
   */
  static start() {
    if (this.cronJob) {
      console.log('[ScheduledLivestreamJob] Job already started');
      return;
    }

    // Chạy mỗi phút: '*/1 * * * *'
    const cronExpression = '*/1 * * * *';

    console.log('[ScheduledLivestreamJob] Starting scheduled livestream activation job (every minute)');
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      if (this.isRunning) {
        console.log('[ScheduledLivestreamJob] Previous activation still running, skipping this cycle');
        return;
      }

      try {
        this.isRunning = true;
        const now = new Date();
        console.log(`[ScheduledLivestreamJob] Checking for scheduled livestreams ready to activate at ${now.toISOString()}`);

        const livestreamRepository = require('../repositories/livestreamRepository');
        const readyLivestreams = await livestreamRepository.findScheduledReadyToActivate(now);

        if (readyLivestreams.length === 0) {
          console.log('[ScheduledLivestreamJob] No scheduled livestreams ready to activate');
          return;
        }

        console.log(`[ScheduledLivestreamJob] Found ${readyLivestreams.length} scheduled livestream(s) ready to activate`);

        // Activate each scheduled livestream
        for (const livestream of readyLivestreams) {
          try {
            console.log(`[ScheduledLivestreamJob] Activating livestream ${livestream.livestreamId} (${livestream.title})`);
            const result = await livestreamService.activateScheduledLivestream(livestream.livestreamId);
            console.log(`[ScheduledLivestreamJob] Successfully activated livestream ${livestream.livestreamId}`);
          } catch (error) {
            console.error(`[ScheduledLivestreamJob] Error activating livestream ${livestream.livestreamId}:`, error.message);
            // Continue with next livestream even if one fails
          }
        }

        console.log(`[ScheduledLivestreamJob] Completed activation cycle`);
      } catch (error) {
        console.error('[ScheduledLivestreamJob] Error during activation cycle:', error);
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
        console.log('[ScheduledLivestreamJob] Running initial check...');
        this.isRunning = true;
        const now = new Date();
        const livestreamRepository = require('../repositories/livestreamRepository');
        const readyLivestreams = await livestreamRepository.findScheduledReadyToActivate(now);

        if (readyLivestreams.length > 0) {
          console.log(`[ScheduledLivestreamJob] Found ${readyLivestreams.length} scheduled livestream(s) ready to activate on startup`);
          for (const livestream of readyLivestreams) {
            try {
              await livestreamService.activateScheduledLivestream(livestream.livestreamId);
              console.log(`[ScheduledLivestreamJob] Activated livestream ${livestream.livestreamId} on startup`);
            } catch (error) {
              console.error(`[ScheduledLivestreamJob] Error activating livestream ${livestream.livestreamId} on startup:`, error.message);
            }
          }
        } else {
          console.log('[ScheduledLivestreamJob] No scheduled livestreams ready to activate on startup');
        }
      } catch (error) {
        console.error('[ScheduledLivestreamJob] Error during initial check:', error);
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
      console.log('[ScheduledLivestreamJob] Job stopped');
    }
  }

  /**
   * Chạy activation ngay lập tức (manual trigger)
   */
  static async runNow() {
    if (this.isRunning) {
      throw new Error('Activation is already running');
    }

    try {
      this.isRunning = true;
      console.log('[ScheduledLivestreamJob] Manual activation triggered');
      const now = new Date();
      const livestreamRepository = require('../repositories/livestreamRepository');
      const readyLivestreams = await livestreamRepository.findScheduledReadyToActivate(now);

      const results = [];
      for (const livestream of readyLivestreams) {
        try {
          const result = await livestreamService.activateScheduledLivestream(livestream.livestreamId);
          results.push({ livestreamId: livestream.livestreamId, success: true, result });
        } catch (error) {
          results.push({ livestreamId: livestream.livestreamId, success: false, error: error.message });
        }
      }

      return { count: readyLivestreams.length, results };
    } catch (error) {
      console.error('[ScheduledLivestreamJob] Error during manual activation:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = ScheduledLivestreamJob;

