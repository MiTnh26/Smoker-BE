require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const { initSQLConnection } = require("./db/sqlserver");
const { authRoutes, userRoutes, businessRoutes, barPageRoutes,tableClassificationRoutes,barTableRoutes } = require("./routes");

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
app.use("/api/bar", barPageRoutes);
app.use("/api/table-classification", tableClassificationRoutes);
app.use("/api/bar-table", barTableRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/business", businessRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Smoker API 🚬" });
});

module.exports = app;
