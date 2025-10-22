// testMail.js
require("dotenv").config(); // load .env
const { sendMail } = require("./src/utils/mailer"); // đường dẫn đến mailer.js

async function testMail() {
  try {
    await sendMail({ 
      to: "work.hoangcongkhoa@gmail.com",    // đổi thành Gmail bạn muốn test
      subject: "Test Mail", 
      html: "<p>Hello, this is a test!</p>" 
    });
    console.log("Mail sent successfully");
  } catch (err) {
    console.error("Mail failed:", err);
  }
}

testMail();
