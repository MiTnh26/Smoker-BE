const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gmailRegex = /^[A-Za-z0-9._%+-]+@gmail\.com$/i;
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function isValidEmail(email) {
  return emailRegex.test(String(email || "").trim());
}

function isValidPassword(password) {
  return passwordRegex.test(String(password || ""));
}

function isGmailEmail(email) {
  return gmailRegex.test(String(email || "").trim());
}

module.exports = { isValidEmail, isValidPassword, isGmailEmail, emailRegex, passwordRegex, gmailRegex };


