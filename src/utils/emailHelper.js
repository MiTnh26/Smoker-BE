/**
 * Tạo tên hiển thị từ email
 * Ví dụ: nguyenvan@gmail.com -> Nguyenv An
 *        john.doe@gmail.com -> John Doe
 */
function generateDisplayNameFromEmail(email) {
  if (!email) return null;
  
  // Lấy phần trước @
  const localPart = email.split('@')[0];
  if (!localPart) return null;
  
  // Xử lý các trường hợp:
  // 1. Có dấu chấm: john.doe -> John Doe
  // 2. Có số: nguyen123 -> Nguyen
  // 3. Chỉ có chữ: nguyenvan -> Nguyenv An
  
  // Loại bỏ số ở cuối
  let cleaned = localPart.replace(/\d+$/, '');
  
  // Nếu có dấu chấm, tách và viết hoa chữ cái đầu
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    return parts
      .map(part => {
        const trimmed = part.trim();
        if (!trimmed) return '';
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      })
      .filter(p => p)
      .join(' ');
  }
  
  // Nếu có dấu gạch dưới hoặc gạch ngang
  if (cleaned.includes('_') || cleaned.includes('-')) {
    const separator = cleaned.includes('_') ? '_' : '-';
    const parts = cleaned.split(separator);
    return parts
      .map(part => {
        const trimmed = part.trim();
        if (!trimmed) return '';
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      })
      .filter(p => p)
      .join(' ');
  }
  
  // Nếu có chữ hoa (camelCase): nguyenVan -> Nguyen Van
  if (/[a-z][A-Z]/.test(cleaned)) {
    const parts = cleaned.split(/(?=[A-Z])/);
    return parts
      .map(part => {
        const trimmed = part.trim();
        if (!trimmed) return '';
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      })
      .filter(p => p)
      .join(' ');
  }
  
  // Mặc định: viết hoa chữ cái đầu
  // Nếu quá dài (>15 ký tự), cắt ngắn và thêm "User"
  if (cleaned.length > 15) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1, 15).toLowerCase() + ' User';
  }
  
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * Tạo URL avatar từ email sử dụng UI Avatars
 * @param {string} email - Email của user
 * @param {string} name - Tên hiển thị (optional)
 * @returns {string} URL avatar
 */
function generateAvatarFromEmail(email, name = null) {
  if (!email) return null;
  
  // Sử dụng tên nếu có, nếu không thì dùng chữ cái đầu của email
  const displayName = name || email.charAt(0).toUpperCase();
  
  // Tạo URL avatar từ UI Avatars với màu ngẫu nhiên dựa trên email
  // Sử dụng hash của email để tạo màu nhất quán
  const hash = email.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  // Tạo màu từ hash (màu sáng, dễ nhìn)
  const hue = Math.abs(hash % 360);
  const saturation = 60 + (Math.abs(hash) % 20); // 60-80%
  const lightness = 50 + (Math.abs(hash) % 15); // 50-65%
  
  // Encode tên để dùng trong URL
  const encodedName = encodeURIComponent(displayName);
  
  // Tạo URL avatar với UI Avatars
  // Format: https://ui-avatars.com/api/?name=Name&size=200&background=color&color=fff&bold=true
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodedName}&size=200&background=hsl(${hue},${saturation}%,${lightness}%)&color=fff&bold=true&format=png`;
  
  return avatarUrl;
}

module.exports = {
  generateDisplayNameFromEmail,
  generateAvatarFromEmail
};


