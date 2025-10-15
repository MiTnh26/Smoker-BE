require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const { initSQLConnection } = require("./db/sqlserver");
const { authRoutes, userRoutes } = require("./routes");

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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Smoker API 🚬" });
});

module.exports = app;
