const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const tx = getTransporter();
  const from = process.env.EMAIL_FROM || "Smoker <no-reply@smoker.com>";
  try {
    const info = await tx.sendMail({ from, to, subject, html });
    console.log("Mail sent:", info.messageId, "to", to);
  } catch (err) {
    console.error("Send mail error:", err);
    throw err;
  }
}

module.exports = { sendMail };
