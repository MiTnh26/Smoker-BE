require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const { initSQLConnection } = require("./db/sqlserver");
const { eventRoutes, barTableBookingRoutes, bookingReviewRoutes } = require("./routes");
const { messageRoutes } = require("./routes");


const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*",
  })
);

// Khởi tạo kết nối SQL Server
initSQLConnection();

// Routes
app.use("/api/messages", messageRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/bar-tables", barTableBookingRoutes);
app.use("/api/booking-review", bookingReviewRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to Smoker API 🚬" });
});

module.exports = app;