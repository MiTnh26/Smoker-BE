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

// CORS configuration - MUST be before express.json() and routes
// Default origins for local development
const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173'];

// Production frontend URL
const productionFrontendUrl = 'https://smoker-fe-henna.vercel.app';

// Get allowed origins from environment variable
let allowedOrigins = defaultOrigins;

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;

if (process.env.FRONTEND_URL) {
  // If FRONTEND_URL is set, use it (can be comma-separated for multiple origins)
  allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
  
  // In production, always ensure production frontend URL is included
  if (isProduction && !allowedOrigins.includes(productionFrontendUrl)) {
    allowedOrigins.push(productionFrontendUrl);
    console.log('🔧 Added production frontend URL to allowed origins');
  }
} else {
  // If not set, check if we're in production
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

// Helper function to check if origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow requests with no origin
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
};

// Helper function to set CORS headers
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  
  // Always set CORS headers based on origin
  if (origin && isOriginAllowed(origin)) {
    // If origin is in allowed list, use it directly
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (isProduction && origin === productionFrontendUrl) {
    // In production, always allow production frontend URL
    res.setHeader('Access-Control-Allow-Origin', productionFrontendUrl);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (allowedOrigins.length > 0 && isProduction) {
    // In production, default to production URL
    res.setHeader('Access-Control-Allow-Origin', productionFrontendUrl);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (allowedOrigins.length > 0) {
    // Fallback to first allowed origin
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
};

// Handle preflight OPTIONS requests FIRST - before everything else
app.use((req, res, next) => {
  // Set CORS headers for all requests
  setCorsHeaders(req, res);
  
  // Handle OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    console.log(`🔍 OPTIONS preflight request from origin: ${origin}`);
    
    if (isOriginAllowed(origin)) {
      console.log(`✅ OPTIONS allowed for origin: ${origin}`);
      return res.status(204).end(); // Use .end() instead of sendStatus for better compatibility
    } else {
      console.warn(`❌ OPTIONS request blocked for origin: ${origin}`);
      console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
      return res.status(403).end();
    }
  }
  next();
});

// CORS middleware for actual requests (non-OPTIONS)
app.use(
  cors({
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        console.log(`✅ CORS allowed for origin: ${origin || 'no origin'}`);
        return callback(null, true);
      } else {
        console.warn(`❌ CORS blocked origin: ${origin}`);
        console.warn(`   Allowed origins: ${allowedOrigins.join(', ')}`);
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

app.use("/api/events",eventRoutes)
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
app.use("/api/booking", bookingRoutes);

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

// ERROR HANDLER - MUST be after all routes
// This ensures CORS headers are set even when errors occur
app.use((err, req, res, next) => {
  // Set CORS headers even for errors
  setCorsHeaders(req, res);
  
  console.error('❌ Error:', err.message);
  if (err.stack) {
    console.error('Stack:', err.stack);
  }
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // CORS error handling
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      status: 'error',
      message: 'CORS: Origin not allowed',
      origin: req.headers.origin
    });
  }
  
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 Handler - also needs CORS headers
app.use((req, res) => {
  // Set CORS headers for 404 responses
  setCorsHeaders(req, res);
  
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
    path: req.path
  });
});

module.exports = app;
