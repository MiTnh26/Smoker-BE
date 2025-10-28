const express = require("express");
require("dotenv").config();
const app = express();
app.use(express.json());
const cors = require("cors");

// Cho phép frontend localhost:3000 truy cập
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // nếu bạn dùng cookie, token hoặc session
  })
);
//Ket noi voi mongodb
// const mongoose = require("mongoose");
// mongoose
//   .connect(`${process.env.URL}${process.env.DBNAME}`)
//   .then(() => console.log("Connecting to mongodb using mongoose"))
//   .catch((err) => console.log(`Connect fail:${err}`));

// //Cho server Khoi dong

const port = process.env.PORT || 9999;
app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});

