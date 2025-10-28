require("dotenv").config();
const app = require("./src/app");
const db = require("./src/db/sqlserver");
const { initSQLConnection } = require("./db/sqlserver");
const EventRoutes = require("./src/routes/eventRoutes");

app.use("/api/event",EventRoutes);

const port = process.env.PORT || 9999;

initSQLConnection() // test kết nối SQL Server khi server start
  .then(() => {
    app.listen(port, () => {
      console.log(`✅ Server is running at http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error("❌ Failed to start server due to DB error:", err);
  });
