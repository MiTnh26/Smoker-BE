require("dotenv").config();
const app = require("./src/app");

const port = process.env.PORT || 9999;
app.listen(port, () => {
  console.log(`✅ Server is running at http://localhost:${port}`);
});
