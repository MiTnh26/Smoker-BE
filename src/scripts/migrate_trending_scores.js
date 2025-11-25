/**
 * Migration script để tính trending score cho tất cả posts hiện có
 * Chạy một lần khi deploy để set trendingScore cho posts cũ
 * 
 * Usage: node src/scripts/migrate_trending_scores.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const FeedAlgorithm = require("../services/feedAlgorithm");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error("❌ MONGO_URI is not set in environment variables");
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error("❌ MongoDB connection failed: ", error.message || error);
    process.exit(1);
  }
};

const migrateTrendingScores = async () => {
  try {
    console.log('🚀 Starting migration: Calculate trending scores for all posts...');
    
    let skip = 0;
    const limit = 100;
    let hasMore = true;
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;

    while (hasMore) {
      console.log(`\n📦 Processing batch: skip=${skip}, limit=${limit}`);
      
      const result = await FeedAlgorithm.recalculateAllPosts({
        limit,
        skip,
        userId: null // Không có userId cụ thể, tính điểm công khai
      });

      totalProcessed += result.processed;
      totalUpdated += result.updated;
      totalErrors += result.errors;
      hasMore = result.hasMore;

      console.log(`✅ Batch completed: processed=${result.processed}, updated=${result.updated}, errors=${result.errors}`);

      if (hasMore) {
        skip += limit;
        // Nghỉ một chút giữa các batch
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`   - Total processed: ${totalProcessed}`);
    console.log(`   - Total updated: ${totalUpdated}`);
    console.log(`   - Total errors: ${totalErrors}`);
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await migrateTrendingScores();
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  }
};

// Run migration
main();

