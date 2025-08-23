// Conversion-Mapping.js
// Chuẩn hóa và mapping dữ liệu scam để đẩy vào Strapi

/**
 * Chuẩn hóa số điện thoại về dạng 0xxxxxxxxx (VN)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  let p = phone.split(',')[0].trim();
  p = p.replace(/[^0-9+]/g, '');
  // E.164 chuẩn quốc tế
  if (p.startsWith('+84')) {
    return p;
  } else if (p.startsWith('84')) {
    return '+84' + p.slice(2);
  } else if (p.startsWith('0') && p.length === 10) {
    return '+84' + p.slice(1);
  } else {
    // fallback: giữ nguyên nếu không nhận diện được
    return p;
  }
}

/**
 * Chuẩn hóa tài khoản ngân hàng (lấy số đầu tiên, bỏ ký tự lạ)
 */
function normalizeAccount(account) {
  if (!account) return '';
  let a = account.split(',')[0].trim();
  a = a.replace(/[^0-9]/g, '');
  return a;
}

/**
 * Mapping field cho Strapi schema (ví dụ, có thể sửa lại cho đúng model backend)
 * @param {Object} record - Record đã validate
 * @returns {Object} object chuẩn hóa cho Strapi
 */
function convertForStrapi(record) {
  const mapped = {
    phone: normalizePhone(record.phone),
    account: normalizeAccount(record.account),
    bank: record.bank || '',
    amount: record.amount || '',
    content: record.content || '',
    url: record.url || '',
    extractedAt: record.extractedAt || new Date().toISOString(),
    source: record.source || 'passive-extension',
    score: record.score || 0,
    flags: record.flags || [],
  };
  // Mapping enrich fields nếu có
  if (record.nickname) mapped.nickname = record.nickname;
  if (record.sourceUpvoteCount !== undefined) mapped.sourceUpvoteCount = record.sourceUpvoteCount;
  if (record.sourceDownvoteCount !== undefined) mapped.sourceDownvoteCount = record.sourceDownvoteCount;
  if (record.sourceReporterReputation !== undefined) mapped.sourceReporterReputation = record.sourceReporterReputation;
  if (record.sourceReporterReportCount !== undefined) mapped.sourceReporterReportCount = record.sourceReporterReportCount;
  if (record.sourceReporterJoinedAt) mapped.sourceReporterJoinedAt = record.sourceReporterJoinedAt;
  if (record.reporterPhone) mapped.reporterPhone = record.reporterPhone;
  if (record.tags) mapped.tags = record.tags;
  return mapped;
}

// Export cho node/browser
if (typeof module !== 'undefined') {
  module.exports = { convertForStrapi, normalizePhone, normalizeAccount };
} else {
  window.convertForStrapi = convertForStrapi;
}
