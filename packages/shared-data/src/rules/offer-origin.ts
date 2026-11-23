/**
 * Product distribution origin (official VN/A vs parallel import vs unknown)
 * and seller channel classification shared across the importer and web app.
 *
 * Plain functions and constants only: no zod and no Supabase client, so client
 * components can import the rules subpath without pulling either into
 * the browser bundle.
 */

export type ProductOrigin = 'official_vna' | 'imported' | 'unknown';

export type SellerChannel =
  'authorized_vat' | 'official_mall' | 'independent_shop';

export interface SellerChannelInput {
  readonly platform?: string | null;
  readonly isOfficial?: boolean | null;
  readonly merchantName?: string | null;
  readonly title?: string | null;
}

const MAX_ORIGIN_TITLE_LENGTH = 2000;
const MAX_ORIGIN_DESCRIPTION_LENGTH = 8000;
const MAX_SELLER_NAME_LENGTH = 200;
const MAX_PLATFORM_LENGTH = 64;

function cleanOriginText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .slice(0, maxLen)
    .replace(/\p{Cc}+/gu, ' ')
    .normalize('NFC');
}

const IMPORTED_ORIGIN_RE =
  /(?:xách\s*tay|xach\s*tay|bản\s*mỹ|(?<![a-z0-9])(?:ll|zp|za|ch|kh|j|hk)\/a(?![a-z0-9])|bản\s*hàn|bản\s*nhật|bản\s*trung|nội\s*địa(?:\s*trung|\s*nhật|\s*hàn)?|quốc\s*tế\s*mỹ|quoc\s*te\s*my)/i;

const OFFICIAL_VNA_ORIGIN_RE =
  /(?<![a-z0-9])vn\/a(?![a-z0-9])|(?<![a-z0-9])vna(?![a-z0-9])|chính\s*hãng|chinh\s*hang|phân\s*phối\s*chính\s*hãng|(?:apple|samsung|xiaomi|oppo|sony|garmin|asus|lenovo)\s*(?:việt\s*nam|viet\s*nam)|(?:đại\s*lý|nhà\s*bán\s*lẻ)\s*(?:uỷ\s*quyền|ủy\s*quyền)|(?:apple|samsung)\s*authorized/i;

/**
 * Direct Vietnamese retail chains whose domain represents an authorized VAT
 * retailer rather than a multi-seller marketplace.
 */
const AUTHORIZED_VAT_CHAIN_PLATFORMS = new Set<string>([
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
  'dienmayxanh',
  'topzone',
  'gearvn',
  'nguyenkim',
  'shopdunk',
  'hacom',
  'clickbuy',
  'viettelstore',
  'pico',
  'mediamart',
  'memoryzone',
  'anphatpc',
]);

const AUTHORIZED_VAT_MERCHANT_RE =
  /[^\p{L}\d](?:tiki\s+trading|tikitrading|thế\s+giới\s+di\s+động|the\s+gioi\s+di\s+dong|thegioididong|tgdd|topzone|fpt\s+shop|fptshop|f\.?\s*studio|cellphone\s*s|shopdunk|viettel\s+store|viettelstore|hoàng\s+hà(?:\s+mobile)?|hoang\s+ha(?:\s+mobile)?|di\s+động\s+việt|di\s+dong\s+viet|didongviet|điện\s+máy\s+xanh|dien\s+may\s+xanh|dienmayxanh|phong\s+vũ|phong\s+vu|phongvu|gearvn|nguyễn\s+kim|nguyen\s+kim|nguyenkim|hacom|an\s+phát(?:\s+pc|\s+computer)?|an\s+phat(?:\s+pc|\s+computer)?|anphat(?:pc)?|memoryzone|mediamart|pico)(?=[^\p{L}\d])/iu;

function isAuthorizedVatMerchantName(merchantName: string): boolean {
  if (!merchantName) return false;
  return AUTHORIZED_VAT_MERCHANT_RE.test(` ${merchantName} `);
}

const EXPLICIT_AUTHORIZED_VAT_RE =
  /(?:đại\s*lý\s*(?:uỷ|ủy)\s*quyền|authorized\s*reseller|chính\s*hãng\s*vat|xuất\s*(?:hóa|hoá)\s*đơn\s*vat)/i;

function detectProductOriginImpl(
  title: string,
  description?: string
): ProductOrigin {
  const safeTitle = cleanOriginText(title, MAX_ORIGIN_TITLE_LENGTH);
  const safeDesc = cleanOriginText(description, MAX_ORIGIN_DESCRIPTION_LENGTH);
  const combined = safeDesc ? `${safeTitle} ${safeDesc}` : safeTitle;
  if (!combined.trim()) return 'unknown';

  if (IMPORTED_ORIGIN_RE.test(combined)) {
    return 'imported';
  }
  if (OFFICIAL_VNA_ORIGIN_RE.test(combined)) {
    return 'official_vna';
  }
  return 'unknown';
}

/**
 * Detect product distribution origin (official VN/A vs parallel import vs unknown).
 * Checks imported indicators before official markers so listings mixing both
 * (e.g. "Xach tay LL/A Chinh hang Apple") never misclassify as official VN/A.
 */
export function detectProductOrigin(
  title: string,
  description?: string
): ProductOrigin {
  return detectProductOriginImpl(title, description);
}

function classifySellerChannelImpl(
  input: SellerChannelInput | null | undefined
): SellerChannel {
  if (!input || typeof input !== 'object') return 'independent_shop';

  const platform = cleanOriginText(input.platform, MAX_PLATFORM_LENGTH)
    .trim()
    .toLowerCase();
  const merchantName = cleanOriginText(
    input.merchantName,
    MAX_SELLER_NAME_LENGTH
  ).trim();
  const title = cleanOriginText(input.title, MAX_ORIGIN_TITLE_LENGTH).trim();

  if (title && detectProductOriginImpl(title) === 'imported') {
    return 'independent_shop';
  }

  if (AUTHORIZED_VAT_CHAIN_PLATFORMS.has(platform)) {
    return 'authorized_vat';
  }

  if (input.isOfficial === true) {
    if (
      isAuthorizedVatMerchantName(merchantName) ||
      EXPLICIT_AUTHORIZED_VAT_RE.test(`${merchantName} ${title}`)
    ) {
      return 'authorized_vat';
    }
    return 'official_mall';
  }

  if (
    input.isOfficial !== false &&
    platform === 'tiki' &&
    /^tiki\s*trading$/i.test(merchantName)
  ) {
    return 'authorized_vat';
  }

  return 'independent_shop';
}

/**
 * Classify a seller listing into its warranty/invoice channel:
 * - authorized_vat: official retail chain or verified authorized VAT store
 * - official_mall: official brand flagship/mall storefront on a marketplace
 * - independent_shop: third-party or unverified seller (or imported stock)
 */
export function classifySellerChannel(
  input: SellerChannelInput | null | undefined
): SellerChannel {
  return classifySellerChannelImpl(input);
}
