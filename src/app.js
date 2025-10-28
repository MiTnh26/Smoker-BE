require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { initSQLConnection } = require("./db/sqlserver");
const connectDB = require("./db/mongodb");
const { authRoutes, userRoutes, businessRoutes, barPageRoutes,tableClassificationRoutes,barTableRoutes,eventRoutes,postRoutes,storyRoutes, comboRoutes, voucherRoutes,voucherApplyRoutes } = require("./routes");


const app = express();

app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
// Khởi tạo kết nối MongoDB
connectDB();
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
app.use("/api/events",eventRoutes)
app.use("/api/posts", postRoutes);
app.use("/api/stories", storyRoutes);

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
