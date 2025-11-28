require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { initSQLConnection } = require("./db/sqlserver");
const connectDB = require("./db/mongodb");
const {
  authRoutes,
  userRoutes,
  businessRoutes,
  barPageRoutes,
  tableClassificationRoutes,
  barTableRoutes,
  eventRoutes,
  postRoutes,
  storyRoutes,
  comboRoutes,
  voucherRoutes,
  voucherApplyRoutes,
  songRoutes,
  musicRoutes,
  messageRoutes,
  notificationRoutes,
  followRoutes,
  searchRoutes,
  reportRoutes,
  bankInfoRoutes,
  livestreamRoutes,
  mediaRoutes,
  bookingTableRoutes,
  bookingRoutes,
  adminRoutes,
  payosRoutes,
  adRoutes,
  adminAdRoutes,
  feedRoutes,
  profileRoutes,
} = require("./routes");


const userReviewRoutes = require('./routes/userReviewRoutes');
const barReviewRoutes = require('./routes/barReviewRoutes');


const app = express();

// CORS phải được đặt TRƯỚC các middleware khác để đảm bảo CORS headers có trong mọi response (kể cả error)
app.use(
  cors({
    origin: "*",
    // methods: không chỉ định = cho phép tất cả methods
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With","x-locale"], // Explicitly include Authorization
    exposedHeaders: ["Authorization"],
    credentials: false, // Set to false when origin is "*"
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ strict: false })); // strict: false cho phép parse null/empty body
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Khởi tạo kết nối MongoDB
connectDB();

// Khởi động background job để recalculate trending score định kỳ
// Chạy sau khi MongoDB đã kết nối (sử dụng mongoose connection event)
mongoose.connection.once('open', () => {
  const FeedRecalculateJob = require("./services/feedRecalculateJob");
  // Bắt đầu job với interval 2 giờ (có thể config qua env)
  const intervalHours = process.env.FEED_RECALCULATE_INTERVAL_HOURS 
    ? parseInt(process.env.FEED_RECALCULATE_INTERVAL_HOURS) 
    : 2;
  FeedRecalculateJob.start(intervalHours);
  console.log(`[App] Feed recalculate job started (interval: ${intervalHours} hours)`);

  // Khởi động background job để tự động xóa posts đã trash sau 30 ngày
  const PostService = require("./services/postService");
  // Chạy job mỗi ngày (24 giờ)
  const autoDeleteIntervalHours = 24;
  setInterval(async () => {
    try {
      console.log('[App] Running auto delete trashed posts job...');
      const result = await PostService.autoDeleteTrashedPosts();
      if (result.success) {
        console.log(`[App] Auto delete job completed: ${result.message}`);
      } else {
        console.error(`[App] Auto delete job failed: ${result.message}`);
      }
    } catch (error) {
      console.error('[App] Error in auto delete job:', error.message);
    }
  }, autoDeleteIntervalHours * 60 * 60 * 1000);
  console.log(`[App] Auto delete trashed posts job started (interval: ${autoDeleteIntervalHours} hours)`);
  
  // Chạy ngay lập tức lần đầu
  PostService.autoDeleteTrashedPosts().then(result => {
    if (result.success) {
      console.log(`[App] Initial auto delete job completed: ${result.message}`);
    }
  }).catch(error => {
    console.error('[App] Error in initial auto delete job:', error.message);
  });
});

// Debug middleware
app.use((req, res, next) => {
  if (req.url !== "/api/user/profile") { // Skip debug for profile to reduce noise
    console.log("📡 Incoming request:", req.method, req.url);
  }
  next();
});

// Khởi tạo kết nối SQL Server và tự động tạo admin account khi server khởi động
const { initializeAdmin } = require("./utils/adminSetup");
initSQLConnection().then(() => {
  initializeAdmin();
}).catch(err => {
  console.error("⚠️  SQL connection failed, skipping admin initialization");
});

// Routes

app.use("/api/voucher-apply", voucherApplyRoutes);
app.use("/api/voucher", voucherRoutes);
app.use("/api/combo", comboRoutes);
app.use("/api/bar", barPageRoutes);
app.use("/api/table-classification", tableClassificationRoutes);
app.use("/api/bar-table", barTableRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/song", songRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/bank-info", bankInfoRoutes);
app.use("/api/livestream", livestreamRoutes);
app.use("/api/medias", mediaRoutes);
app.use("/api/bookingtable", bookingTableRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/pay", payosRoutes);
// UserReview & BarReview APIs
app.use("/api/user-reviews", userReviewRoutes);
app.use("/api/bar-reviews", barReviewRoutes);
app.use("/api/ads", adRoutes);
app.use("/api/admin", adminAdRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/event-advertisements", require("./routes/eventAdvertisementRoutes"));
app.use("/api/feed", feedRoutes);
app.use("/api/profile", profileRoutes);
// UserReview & BarReview APIs
app.use("/api/user-reviews", userReviewRoutes);
app.use("/api/bar-reviews", barReviewRoutes);
app.get("/", (req, res) => {
  res.json({ 
    message: "Welcome to Smoker API 🚬",
    status: "OK",
    timestamp: new Date().toISOString(),
    databases: {
      sqlserver: "Attempting connection...", // SQL Server connection status
      mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
    }
  });
});

module.exports = app;
