// const express = require("express");
// require("dotenv").config();
// const cors = require("cors");
// // const app = express();
// const app = require("./src/app");

// app.use(express.json());
// app.use(
//   cors({
//     origin: "http://localhost:3000",
//     credentials: true,
//   })
// );

// // --- Kết nối MongoDB (nếu vẫn cần)
// const mongoose = require("mongoose");
// mongoose
//   .connect(`${process.env.MONGO_URI}${process.env.DBNAME}`)
//   .then(() => console.log("Connected to MongoDB"))
//   .catch((err) => console.log(`Connect fail:${err}`));

// // --- Kết nối SQL Server ---
// const { getConnection } = require("./src/db/sqlserver");
// getConnection(); // gọi để khởi tạo pool

// // --- Route test SQL Server ---
// app.get("/accounts", async (req, res) => {
//   try {
//     const pool = await getConnection();
//     const result = await pool.request().query("SELECT * FROM Accounts");
//     res.json(result.recordset);
//   } catch (err) {
//     res.status(500).json({ message: "Query failed", error: err.message });
//   }
// });

// const port = process.env.PORT || 9999;
// const host = process.env.HOSTNAME || "localhost";
// app.listen(port, host, () => {
//   console.log(`Server is running at http://${host}:${port}`);
// });
require("dotenv").config();
const app = require("./src/app");

const port = process.env.PORT || 9999;
const host = process.env.HOSTNAME || "localhost";

app.listen(port, host, () => {
  console.log(`🚀 Server is running at http://${host}:${port}`);
});
