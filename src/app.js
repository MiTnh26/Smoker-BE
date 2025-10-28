require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { initSQLConnection } = require("./db/sqlserver");
const { authRoutes, userRoutes, businessRoutes, postRoutes , barPageRoutes,tableClassificationRoutes,barTableRoutes,eventRoutes, comboRoutes, voucherRoutes,voucherApplyRoutes } = require("./routes");


const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// Khởi tạo kết nối SQL Server
initSQLConnection();

// Khởi tạo kết nối MongoDB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/Smoker";

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
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
app.use("/api/posts", postRoutes);

app.use("/api/events",eventRoutes)
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
