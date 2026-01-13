/**
 * Utility functions for validating address format
 * Standard format: {"detail":"13","provinceId":"1","districtId":"21","wardId":"617"}
 */

/**
 * Validates that address is a valid JSON string with all 4 required fields
 * @param {string} addressString - Address string (should be JSON)
 * @returns {object|null} - Parsed address object or null if invalid
 */
function validateAddressFormat(addressString) {
  if (!addressString || typeof addressString !== 'string') {
    return null;
  }

  const trimmed = addressString.trim();
  if (!trimmed) {
    return null;
  }

  // Must be JSON string
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    
    // Validate it's an object
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // Validate all 4 required fields are present and non-empty
    const detail = parsed.detail || parsed.Detail || '';
    const provinceId = parsed.provinceId || parsed.ProvinceId || '';
    const districtId = parsed.districtId || parsed.DistrictId || '';
    const wardId = parsed.wardId || parsed.WardId || '';

    if (!detail || !detail.trim() === '') {
      return null;
    }
    if (!provinceId || provinceId.trim() === '') {
      return null;
    }
    if (!districtId || districtId.trim() === '') {
      return null;
    }
    if (!wardId || wardId.trim() === '') {
      return null;
    }

    // Return normalized address object
    return {
      detail: detail.trim(),
      provinceId: provinceId.trim(),
      districtId: districtId.trim(),
      wardId: wardId.trim()
    };
  } catch (e) {
    console.error('[AddressValidator] Failed to parse address JSON:', e);
    return null;
  }
}

/**
 * Validates address format and returns error message if invalid
 * @param {string} addressString - Address string to validate
 * @returns {string|null} - Error message or null if valid
 */
function validateAddressWithError(addressString) {
  if (!addressString) {
    return null; // Address is optional
  }

  const validated = validateAddressFormat(addressString);
  if (!validated) {
    return 'Địa chỉ phải có định dạng JSON hợp lệ với đầy đủ 4 trường: detail, provinceId, districtId, wardId';
  }

  return null; // Valid
}

module.exports = {
  validateAddressFormat,
  validateAddressWithError
};

