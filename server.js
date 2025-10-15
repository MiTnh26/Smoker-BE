
require("dotenv").config();
const app = require("./src/app");

const port = process.env.PORT || 9999;
const host = process.env.HOSTNAME || "localhost";

app.listen(port, host, () => {
  console.log(`🚀 Server is running at http://${host}:${port}`);
});
