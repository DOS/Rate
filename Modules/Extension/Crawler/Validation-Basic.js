// Validation-Basic.js
// Basic validation đa quốc gia cho dữ liệu scam của Rate-Extension
// Rule cho từng quốc gia, fallback về generic nếu không xác định được country

/**
 * Regex cho số điện thoại các quốc gia phổ biến
 * Có thể mở rộng thêm cho từng country code
 */
const PHONE_PATTERNS = {
  VN: /^(0|84)(3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)\d{7}$/,
  US: /^\+?1[2-9]\d{2}[2-9](?!11)\d{6}$/,
  // Thêm các quốc gia khác ở đây
  GENERIC: /^\+?\d{7,15}$/ // 7-15 số, cho quốc tế
};

/**
 * Regex cho tài khoản ngân hàng phổ biến (8-20 số)
 * Có thể override theo quốc gia nếu cần
 */
const ACCOUNT_PATTERNS = {
  VN: /^\d{8,14}$/,
  US: /^\d{8,17}$/,
  GENERIC: /^\d{6,20}$/
};

/**
 * Kiểm tra định dạng số điện thoại theo country code
 * @param {string} phone
 * @param {string} country (viết hoa, ví dụ: 'VN', 'US')
 */
function isValidPhone(phone, country = 'GENERIC') {
  const pattern = PHONE_PATTERNS[country] || PHONE_PATTERNS.GENERIC;
  return pattern.test(phone);
}

/**
 * Kiểm tra định dạng số tài khoản theo country code
 * @param {string} account
 * @param {string} country
 */
function isValidAccount(account, country = 'GENERIC') {
  const pattern = ACCOUNT_PATTERNS[country] || ACCOUNT_PATTERNS.GENERIC;
  return pattern.test(account);
}

/**
 * Basic validation cho 1 bản ghi dữ liệu scam
 * @param {Object} record
 * @param {Object} options { country: 'VN' | 'US' | ... }
 * @returns {Object} record + flags + score
 */
function basicValidate(record, options = {}) {
  const country = (options.country || 'GENERIC').toUpperCase();
  const flags = [];
  let score = 100;

  if (record.phone && !isValidPhone(record.phone, country)) {
    flags.push('INVALID_PHONE');
    score -= 30;
  }
  if (record.account && !isValidAccount(record.account, country)) {
    flags.push('INVALID_ACCOUNT');
    score -= 20;
  }
  if (!record.content || record.content.length < 20) {
    flags.push('SHORT_CONTENT');
    score -= 50;
  }

  return {
    ...record,
    flags,
    score: Math.max(0, score),
    validatedCountry: country
  };
}

// Export cho content-script/background dùng (CommonJS + browser)
if (typeof module !== 'undefined') {
  module.exports = { basicValidate, isValidPhone, isValidAccount };
} else {
  window.basicValidate = basicValidate;
}
