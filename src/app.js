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
  bookingRoutes,
} = require("./routes");


const userReviewRoutes = require('./routes/userReviewRoutes');
const barReviewRoutes = require('./routes/barReviewRoutes');


const app = express();

// CORS MUST be configured BEFORE express.json() to handle preflight OPTIONS requests properly
// CORS configuration - support multiple origins
// Default origins for local development
const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173'];

// Production frontend URL
const productionFrontendUrl = 'https://smoker-fe-henna.vercel.app';

// Get allowed origins from environment variable
let allowedOrigins = defaultOrigins;

if (process.env.FRONTEND_URL) {
  // If FRONTEND_URL is set, use it (can be comma-separated for multiple origins)
  allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
} else {
  // If not set, check if we're in production (Render sets NODE_ENV or PORT)
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
  if (isProduction) {
    // In production, add the production frontend URL
    allowedOrigins = [...defaultOrigins, productionFrontendUrl];
    console.warn('⚠️  FRONTEND_URL not set in environment, using fallback:', allowedOrigins);
  }
}

// Log environment info for debugging
console.log('🔍 Environment check:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   RENDER:', process.env.RENDER || 'not set');
console.log('   FRONTEND_URL:', process.env.FRONTEND_URL || 'not set');
console.log('🌐 CORS Allowed Origins:', allowedOrigins);

// CORS middleware with proper preflight handling
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        console.log(`✅ CORS allowed for origin: ${origin}`);
        return callback(null, true);
      } else {
        console.warn(`❌ CORS blocked origin: ${origin}`);
        console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
        // Reject the request if origin is not allowed
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Handle preflight OPTIONS requests explicitly for all routes
// Express 5.x doesn't support wildcard '*' in app.options, so we use middleware instead
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    // Check if origin is allowed
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      // If credentials is true, must set exact origin, not '*'
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
      } else if (allowedOrigins.includes('*')) {
        res.header('Access-Control-Allow-Origin', '*');
      } else {
        // Default to first allowed origin if no origin header
        res.header('Access-Control-Allow-Origin', allowedOrigins[0]);
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
      return res.sendStatus(204);
    } else {
      console.warn(`❌ OPTIONS request blocked for origin: ${origin}`);
      return res.sendStatus(403);
    }
  }
  next();
});

// Now parse JSON body AFTER CORS is configured
app.use(express.json());
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

// Khởi tạo kết nối SQL Server
initSQLConnection();

// Routes - All routes must have /api prefix

// Health check endpoints
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

app.get("/api", (req, res) => {
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

// Authentication routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/user", userRoutes);
app.use("/api/user-reviews", userReviewRoutes);

// Business routes
app.use("/api/business", businessRoutes);

// Bar & Table routes
app.use("/api/bar", barPageRoutes);
app.use("/api/bar-table", barTableRoutes);
app.use("/api/bar-reviews", barReviewRoutes);
app.use("/api/table-classification", tableClassificationRoutes);

// Booking routes
app.use("/api/booking", bookingRoutes);
app.use("/api/bookings", bookingRoutes);

// Content routes
app.use("/api/posts", postRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/events", eventRoutes);

// Media routes
app.use("/api/music", musicRoutes);
app.use("/api/song", songRoutes);
app.use("/api/medias", mediaRoutes);
app.use("/api/livestream", livestreamRoutes);

// Social features
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/follow", followRoutes);

// Utility routes
app.use("/api/search", searchRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/bank-info", bankInfoRoutes);

// Product routes
app.use("/api/voucher", voucherRoutes);
app.use("/api/voucher-apply", voucherApplyRoutes);
app.use("/api/combo", comboRoutes);

module.exports = app;
