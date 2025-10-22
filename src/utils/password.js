function generateRandomPassword(length = 10) {
  const min = 8;
  const max = 12;
  const finalLength = Math.max(min, Math.min(max, length));

  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const specials = "@$!%*?&";
  const all = upper + lower + digits + specials;

  function pick(str) {
    return str[Math.floor(Math.random() * str.length)];
  }

  const required = [pick(upper), pick(digits), pick(specials)];
  const remainingCount = finalLength - required.length;
  const remaining = Array.from({ length: remainingCount }, () => pick(all));

  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

module.exports = { generateRandomPassword };


