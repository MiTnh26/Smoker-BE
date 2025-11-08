const FeedAlgorithm = require("./feedAlgorithm");

/**
 * Background job để recalculate trending score cho tất cả posts
 * Chạy định kỳ để cập nhật time decay và time up score
 */
class FeedRecalculateJob {
  static isRunning = false;
  static intervalId = null;

  /**
   * Bắt đầu background job
   * @param {number} intervalHours - Số giờ giữa mỗi lần chạy (mặc định: 2 giờ)
   */
  static start(intervalHours = 2) {
    if (this.isRunning) {
      console.log('[FeedRecalculateJob] Job is already running');
      return;
    }

    console.log(`[FeedRecalculateJob] Starting background job (interval: ${intervalHours} hours)`);
    
    // Chạy ngay lập tức lần đầu
    this.run();

    // Sau đó chạy định kỳ
    const intervalMs = intervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
    this.intervalId = setInterval(() => {
      this.run();
    }, intervalMs);

    this.isRunning = true;
  }

  /**
   * Dừng background job
   */
  static stop() {
    if (!this.isRunning) {
      console.log('[FeedRecalculateJob] Job is not running');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('[FeedRecalculateJob] Background job stopped');
  }

  /**
   * Chạy recalculate cho tất cả posts
   * Xử lý theo batch để tránh quá tải
   */
  static async run() {
    if (this.isRunning && this.isProcessing) {
      console.log('[FeedRecalculateJob] Previous run is still processing, skipping...');
      return;
    }

    this.isProcessing = true;
    console.log('[FeedRecalculateJob] Starting recalculate all posts...');

    try {
      let skip = 0;
      const limit = 100; // Process 100 posts at a time
      let hasMore = true;
      let totalProcessed = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      while (hasMore) {
        const result = await FeedAlgorithm.recalculateAllPosts({
          limit,
          skip,
          userId: null // Không có userId cụ thể, tính điểm công khai
        });

        totalProcessed += result.processed;
        totalUpdated += result.updated;
        totalErrors += result.errors;
        hasMore = result.hasMore;

        if (hasMore) {
          skip += limit;
        }

        // Nghỉ một chút giữa các batch để tránh quá tải
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      console.log(`[FeedRecalculateJob] Recalculate completed:`, {
        totalProcessed,
        totalUpdated,
        totalErrors
      });
    } catch (error) {
      console.error('[FeedRecalculateJob] Error in recalculate job:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Chạy recalculate một lần (không lặp lại)
   * Useful cho manual trigger hoặc migration
   */
  static async runOnce() {
    console.log('[FeedRecalculateJob] Running one-time recalculate...');
    await this.run();
  }
}

module.exports = FeedRecalculateJob;

