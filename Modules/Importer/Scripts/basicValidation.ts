/**
 * Basic Validation for Rate-Importer
 * Kiểm tra link, domain, nội dung text, gắn flag lỗi và score cơ bản
 */

export interface RecordData {
  link: string;
  content: string;
  bank_account_name?: string;
  evidence_images?: string[];
  flag?: string;
  score?: number;
}

/**
 * Basic validation function for crawler record
 * @param record - data record to validate
 * @param whitelistDomains - array of allowed domains
 * @param blacklistDomains - array of blocked domains
 * @returns validated record with flag and score
 */
export function applyBasicValidation(
  record: RecordData,
  whitelistDomains: string[] = [],
  blacklistDomains: string[] = []
): RecordData {
  // Kiểm tra link hợp lệ
  const urlRegex = /^(https?:\/\/)[\w.-]+(\.[\w\.-]+)+[\w\-\._~:/?#[\]@!$&'()*+,;=.]+$/;
  if (!record.link || !urlRegex.test(record.link)) {
    return { ...record, flag: 'invalid_link', score: 0 };
  }

  // Kiểm tra domain
  let domain = '';
  try {
    domain = new URL(record.link).hostname.replace(/^www\./, '');
  } catch {
    return { ...record, flag: 'invalid_link', score: 0 };
  }
  if (blacklistDomains.includes(domain)) {
    return { ...record, flag: 'blacklisted_domain', score: 0 };
  }
  if (whitelistDomains.length && !whitelistDomains.includes(domain)) {
    return { ...record, flag: 'not_in_whitelist', score: 50 };
  }

  // Kiểm tra nội dung
  if (!record.content || record.content.trim().length < 10) {
    return { ...record, flag: 'empty_content', score: 50 };
  }
  // Không chứa script/html nguy hiểm
  if (/<script|<iframe|onerror=|onload=/.test(record.content)) {
    return { ...record, flag: 'unsafe_content', score: 0 };
  }

  // Nếu qua hết các bước trên
  return { ...record, flag: 'valid', score: 100 };
}

// Example usage
if (require.main === module) {
  const whitelist = ['example.com'];
  const blacklist = ['bad.com'];
  const testRecords: RecordData[] = [
    { link: 'https://example.com/page', content: 'Thông tin hợp lệ' },
    { link: 'http://bad.com', content: 'Nội dung scam' },
    { link: 'ftp://invalid.com', content: 'Sai định dạng link' },
    { link: 'https://example.com', content: '' },
    { link: 'https://unknown.com', content: 'Nội dung test' },
    { link: 'https://example.com', content: '<script>alert(1)</script>' }
  ];
  for (const rec of testRecords) {
    console.log(applyBasicValidation(rec, whitelist, blacklist));
  }
}
