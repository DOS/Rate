import type {
  ExtractedPageProductSignal,
  ExtractedStockState,
  SupportedEcommercePlatform,
} from '../types.js';
import { sliceCodePoints, stripLoneSurrogates } from '../surrogate-safe.js';

/**
 * Strip all tracking query strings (sp_atk, xptdk, utm_*, fbclid, etc.) and hashes.
 */
function isValidDetectorHostname(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    Boolean(lower) &&
    !lower.startsWith('.') &&
    !lower.endsWith('.') &&
    !lower.includes('..')
  );
}

export function sanitizeProductUrl(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') return null;
  const cleaned = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return null;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!isValidDetectorHostname(parsed.hostname)) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function detectEcommercePlatform(
  url: string
): SupportedEcommercePlatform | null {
  if (typeof url !== 'string') return null;
  const cleaned = url.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return null;
  let host: string;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (!isValidDetectorHostname(parsed.hostname)) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return null;
    }
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (isDomainOrSubdomain(host, 'shopee.vn')) return 'shopee';
  if (isDomainOrSubdomain(host, 'lazada.vn')) return 'lazada';
  if (isDomainOrSubdomain(host, 'tiki.vn')) return 'tiki';
  if (isDomainOrSubdomain(host, 'tiktok.com')) return 'tiktok';
  if (isDomainOrSubdomain(host, 'cellphones.com.vn')) return 'cellphones';
  if (isDomainOrSubdomain(host, 'thegioididong.com')) return 'tgdd';
  if (isDomainOrSubdomain(host, 'dienmayxanh.com')) return 'dienmayxanh';
  if (isDomainOrSubdomain(host, 'topzone.vn')) return 'topzone';
  if (isDomainOrSubdomain(host, 'fptshop.com.vn')) return 'fptshop';
  if (isDomainOrSubdomain(host, 'hoanghamobile.com')) return 'hoangha';
  if (isDomainOrSubdomain(host, 'didongviet.vn')) return 'didongviet';
  if (isDomainOrSubdomain(host, 'phongvu.vn')) return 'phongvu';
  if (isDomainOrSubdomain(host, 'gearvn.com')) return 'gearvn';
  if (isDomainOrSubdomain(host, 'nguyenkim.com')) return 'nguyenkim';
  if (isDomainOrSubdomain(host, 'shopdunk.com')) return 'shopdunk';
  if (isDomainOrSubdomain(host, 'hacom.vn')) return 'hacom';
  if (isDomainOrSubdomain(host, 'clickbuy.com.vn')) return 'clickbuy';
  if (isDomainOrSubdomain(host, 'viettelstore.vn')) return 'viettelstore';
  if (isDomainOrSubdomain(host, 'pico.vn')) return 'pico';
  if (isDomainOrSubdomain(host, 'mediamart.vn')) return 'mediamart';
  if (isDomainOrSubdomain(host, 'memoryzone.com.vn')) return 'memoryzone';
  if (isDomainOrSubdomain(host, 'anphatpc.com.vn')) return 'anphatpc';
  return null;
}

const RETAIL_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'tin-tuc',
  'tin-khuyen-mai',
  'cong-nghe',
  'sforum',
  'dchannel',
  'hoi-dap',
  'huong-dan',
  'khuyen-mai',
  'hot-deal',
  'tra-gop',
  'thu-cu-doi-moi',
  'bao-hanh',
  'tra-bao-hanh',
  'tra-cuu-bao-hanh',
  'chinh-sach',
  'lien-he',
  'gioi-thieu',
  've-chung-toi',
  'tuyen-dung',
  'so-sanh',
  'so-sanh-san-pham',
  'compare',
  'cua-hang',
  'showroom',
  'sieu-thi',
  'he-thong-cua-hang',
  'he-thong-sieu-thi',
  'he-thong-showroom',
  'he-thong-trung-tam',
  'trung-tam-bao-hanh',
  'catalogsearch',
  'tim-kiem',
  'ket-qua-tim-kiem',
  'tim',
  'search',
  'filter',
  'cart',
  'gio-hang',
  'checkout',
  'thanh-toan',
  'account',
  'tai-khoan',
  'taikhoan',
  'login',
  'dang-nhap',
  'register',
  'dang-ky',
  'logout',
  'dang-xuat',
  'auth',
  'captcha',
  'challenge',
  'blog',
  'blogs',
  'news',
  'event',
  'su-kien',
  'landing',
  'collection',
  'collections',
  'pages',
  'page',
  'policies',
  'tag',
  'tags',
  'brand',
  'thuong-hieu',
  'buildpc',
  'xay-dung-cau-hinh',
  'sua-chua',
  'dich-vu',
  'may-cu',
  'hang-cu',
  'may-cu-gia-re',
  'likenew',
  'like-new',
  'outlet',
  'xa-kho',
  'ajax',
  'api',
  'media',
  'static',
  'assets',
  'cdn-cgi',
  'c',
  'danh-muc',
]);

const RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX =
  /^(?:chinh-sach-|quy-che-|huong-dan-|dieu-khoan-|gioi-thieu(?:-|$)|ve-chung-toi(?:-|$)|tin-khuyen-mai(?:-|$)|tin-tuc-|khuyen-mai-|sua-chua(?:-|$)|dich-vu(?:-|$)|tra-bao-hanh(?:-|$)|tra-cuu-bao-hanh(?:-|$)|he-thong-(?:cua-hang|sieu-thi|showroom|trung-tam)(?:-|$)|ket-qua-tim-kiem$|so-sanh(?:-san-pham)?$|buildpc$|xay-dung-cau-hinh$)/i;

const RETAIL_AUTH_SEGMENT_REGEX =
  /^(?:login|register|account|tai-khoan|taikhoan|dang-nhap|dang-ky|logout|dang-xuat|auth|captcha|challenge)$/i;

const RETAIL_STATIC_ASSET_EXT_REGEX =
  /\.(?:js|mjs|cjs|json|css|xml|txt|pdf|zip|rar|7z|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|eot|map|mp[34]|webm|aspx|ashx|axd|php)$/i;

const ANPHAT_DESK_PHONE_SLUG_REGEX =
  /^(?:dien-thoai-(?:huu-tuyen|ip|ban|de-ban|khong-day|keo-dai|hoi-nghi)|tong-dai-ip)(?:-|$)/i;

const RETAIL_CATEGORY_ROOT_SLUGS = new Set([
  'dtdd',
  'mtb',
  'dien-thoai',
  'dien-thoai-di-dong',
  'dien-thoai-thong-minh',
  'mobile',
  'smartphones',
  'laptop',
  'laptops',
  'laptop-gaming',
  'laptop-gaming-do-hoa',
  'laptop-van-phong',
  'laptop-tablet-mobile',
  'may-tinh-xach-tay',
  'may-tinh-xach-tay-laptop',
  'may-tinh-bang',
  'may-tinh-bang-tablet',
  'tablet',
  'tablets',
  'dong-ho',
  'dong-ho-thong-minh',
  'smartwatch',
  'smartwatches',
  'tai-nghe',
  'tai-nghe-bluetooth',
  'tai-nghe-nhet-tai',
  'tai-nghe-chup-tai',
  'tai-nghe-gaming',
  'am-thanh',
  'thiet-bi-am-thanh',
  'loa',
  'earbuds',
  'phu-kien',
  'phu-kien-di-dong',
  'linh-kien',
  'linh-kien-may-tinh',
  'man-hinh',
  'man-hinh-may-tinh',
  'pc',
  'pc-gaming',
  'pc-van-phong-do-hoa',
  'may-tinh-de-ban',
  'gaming-gear',
  'tivi',
  'tu-lanh',
  'may-giat',
  'may-lanh',
  'gia-dung',
  'dien-gia-dung',
  'dien-may',
  'sim-so',
  'san-pham',
  'products',
  'product',
  'apple',
  'apple-iphone',
  'apple-ipad',
  'apple-watch',
  'iphone',
  'ipad',
  'macbook',
  'watch',
  'airpods',
]);

// A path ending in a bare brand lists that brand's products, as in
// cellphones.com.vn/mobile/apple.html or fptshop.com.vn/dien-thoai/samsung;
// no product slug is a brand alone (DOS/Rate#1246). Keep these rules in
// sync with parseEcommerceUrlOrQuery in apps/web/src/lib/rate-domain-core.ts.
const RETAIL_BRAND_LISTING_SLUGS = new Set([
  'apple',
  'samsung',
  'xiaomi',
  'redmi',
  'poco',
  'oppo',
  'vivo',
  'realme',
  'oneplus',
  'honor',
  'huawei',
  'nokia',
  'motorola',
  'sony',
  'google',
  'asus',
  'acer',
  'lenovo',
  'dell',
  'hp',
  'msi',
  'lg',
  'tecno',
  'infinix',
  'itel',
  'nubia',
  'zte',
  'masstel',
  'benco',
  'garmin',
  'amazfit',
  'jbl',
  'marshall',
  'anker',
  'baseus',
  'ugreen',
  'logitech',
  'razer',
  'corsair',
  'hyperx',
  'steelseries',
  'bose',
  'sennheiser',
  'gigabyte',
  'tcl',
  'mac',
]);

// "iphone-16-series" lists a series; a case or screen protector for it
// ("op-lung-iphone-16-series") is a product.
const ACCESSORY_SLUG_PREFIX =
  /^(?:op|bao|cuong-luc|kinh|mieng-dan|dan|sac|cu-sac|cap|day|tui|vo|ban-phim|chuot)-/;
const isSeriesListingSlug = (slug: string) =>
  /-series$/.test(slug) && !ACCESSORY_SLUG_PREFIX.test(slug);

const MEDIAMART_ALLOWED_CATEGORY_PREFIXES = new Set([
  'smartphones',
  'dien-thoai',
  'dien-thoai-di-dong',
  'laptop',
  'may-tinh-xach-tay',
  'macbook',
  'may-tinh-bang',
  'tablet',
  'ipad',
  'smartwatch',
  'dong-ho-thong-minh',
  'tai-nghe',
  'san-pham',
  'products',
]);

const HACOM_CATEGORY_BRAND_SLUG_REGEX =
  /^(?:laptop-(?:asus|dell|acer|lenovo|hp|msi|apple|lg|gigabyte)|may-tinh-nguyen-bo-theo-hang|may-tinh-mini-da-dung)$/i;

const CLICKBUY_NON_PRODUCT_SLUG_REGEX =
  /^(?:dien-thoai-(?:iphone|samsung|xiaomi|oppo|vivo|realme|nokia|honor|asus|tcl|google|sony|tecno|infinix|masstel|itel)|(?:iphone|samsung|dien-thoai|ipad|macbook|apple-watch)-cu|thay-pin|ep-kinh|google-pixel|trang)$/i;

const VIETTELSTORE_PRODUCT_CATEGORY_SEGMENTS = new Set([
  'dien-thoai',
  'may-tinh-bang',
  'tablet',
  'laptop',
  'may-tinh-xach-tay',
  'dong-ho-thong-minh',
  'dong-ho',
  'apple-watch',
  'smartwatch',
  'tai-nghe',
  'am-thanh',
  'loa',
  'phu-kien',
  'man-hinh',
  'pc',
  'tivi',
  'san-pham',
  'products',
]);

const VIETTELSTORE_NON_PRODUCT_PREFIXES = new Set([
  'tra-gop',
  'so-sanh',
  'so-sanh-san-pham',
  'tin-tuc',
  'chuyen-muc-tin',
  'landing',
  'khuyen-mai',
  'site',
  'he-thong-sieu-thi',
  'sieu-thi',
  'ho-tro',
  'tuyen-dung',
  'account',
  'login',
  'dang-nhap',
  'register',
  'dang-ky',
  'auth',
  'captcha',
  'challenge',
  'cart',
  'gio-hang',
  'dtdd',
  'mtb',
  'tim-kiem',
  'ket-qua-tim-kiem',
]);

const VIETTELSTORE_CATEGORY_SLUG_REGEX =
  /^(?:dtdd(?:-|$)|mtb(?:-|$)|laptop-(?:apple|asus|acer|dell|hp|lenovo|msi|lg)$|phu-kien-o-to$|bao-da-op-lung$|tam-dan$)/i;

const ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'template',
  'templates',
  'includes',
  'user',
  'order',
  'don-hang',
  'rss',
  'sitemap',
  'robots.txt',
]);

const ANPHAT_INFO_SUFFIX_REGEX =
  /(?:^|-)(?:he-thong-showroom|tin-khuyen-mai|tin-tuc|khuyen-mai|bao-hanh|chinh-sach|huong-dan|lien-he|tuyen-dung|gioi-thieu|pc-an-phat)$/i;

function sha1Hex10(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = ((n << 1) | (n >>> 31)) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp =
        ((((a << 5) | (a >>> 27)) >>> 0) + (f >>> 0) + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return (
    h0.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0')
  ).slice(0, 10);
}

export function sanitizeAnPhatItemId(rawKey: string): string {
  const cleaned = rawKey.trim().replace(/^\/+|\/+$/g, '');
  if (!cleaned) return '';
  const normalized = cleaned.toLowerCase().replace(/[^a-z0-9-]/g, (ch) => {
    const hex = ch.codePointAt(0)?.toString(16).padStart(2, '0') ?? '00';
    return `_${hex}`;
  });
  if (!normalized) return '';
  const maxSlugLen = 125;
  if (normalized.length <= maxSlugLen) {
    return `ap-${normalized}`;
  }
  const digest = sha1Hex10(normalized);
  const keepLen = Math.max(1, maxSlugLen - digest.length - 1);
  let trimmed = normalized.slice(0, keepLen).replace(/[-_]+$/g, '');
  if (!trimmed) trimmed = normalized.slice(0, keepLen);
  return `ap-${trimmed}-${digest}`;
}

function extractValidRetailItemSlug(
  retailPlatform: SupportedEcommercePlatform,
  segments: readonly string[]
): string | null {
  if (segments.length === 0) return null;

  for (const seg of segments) {
    const strippedSeg = seg
      .toLowerCase()
      .replace(/\.(?:html|htm|aspx|ashx|axd|php)$/i, '');
    if (
      RETAIL_AUTH_SEGMENT_REGEX.test(strippedSeg) ||
      RETAIL_AUTH_SEGMENT_REGEX.test(seg)
    ) {
      return null;
    }
  }

  const firstRawLower = segments[0]!.toLowerCase();
  const firstSegLower = firstRawLower.replace(/\.html?$/i, '');
  const lastRaw = segments[segments.length - 1]!;
  if (RETAIL_STATIC_ASSET_EXT_REGEX.test(lastRaw)) {
    return null;
  }
  if (
    (retailPlatform === 'nguyenkim' || retailPlatform === 'pico') &&
    /\.(?:c|b)$/i.test(lastRaw)
  ) {
    return null;
  }

  const isCollectionProductPath =
    segments.length === 4 &&
    firstSegLower === 'collections' &&
    segments[2]!.toLowerCase() === 'products';

  if (retailPlatform === 'gearvn') {
    if (
      !(segments.length === 2 && firstSegLower === 'products') &&
      !isCollectionProductPath
    ) {
      return null;
    }
  } else if (retailPlatform === 'memoryzone') {
    if (
      segments.length !== 1 &&
      !(segments.length === 2 && firstSegLower === 'products') &&
      !isCollectionProductPath
    ) {
      return null;
    }
  } else if (retailPlatform === 'mediamart') {
    if (
      segments.length !== 2 ||
      !MEDIAMART_ALLOWED_CATEGORY_PREFIXES.has(firstSegLower)
    ) {
      return null;
    }
  } else if (
    retailPlatform === 'tgdd' ||
    retailPlatform === 'dienmayxanh' ||
    retailPlatform === 'topzone'
  ) {
    if (segments.length < 2) return null;
  } else if (retailPlatform === 'cellphones') {
    // CellphoneS product pages sit at the root ("/iphone-16-pro-max.html");
    // deeper paths are category listings (DOS/Rate#1246).
    if (segments.length > 1) return null;
  } else if (
    retailPlatform === 'nguyenkim' ||
    retailPlatform === 'shopdunk' ||
    retailPlatform === 'hacom' ||
    retailPlatform === 'clickbuy' ||
    retailPlatform === 'pico'
  ) {
    if (
      segments.length !== 1 &&
      !(
        segments.length === 2 &&
        (firstSegLower === 'products' || firstSegLower === 'san-pham')
      )
    ) {
      return null;
    }
  } else if (retailPlatform === 'viettelstore') {
    if (segments.length > 2) return null;
    if (segments.length === 2) {
      if (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(firstSegLower)) return null;
      const leafLower = lastRaw.toLowerCase().replace(/\.html?$/i, '');
      const hasPid = /(?:^|-)pid[1-9]\d{1,14}$/i.test(leafLower);
      if (
        !VIETTELSTORE_PRODUCT_CATEGORY_SEGMENTS.has(firstSegLower) &&
        !hasPid
      ) {
        return null;
      }
    }
  } else if (retailPlatform === 'anphatpc') {
    const hasHtmlExt = /\.html?$/i.test(lastRaw);
    const isDirectRoutePrefix =
      segments.length === 2 &&
      (firstSegLower === 'products' || firstSegLower === 'san-pham');
    if (!hasHtmlExt && !isDirectRoutePrefix) return null;
    if (
      firstRawLower.startsWith('ajax') ||
      firstRawLower.endsWith('.php') ||
      ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS.has(firstRawLower) ||
      ANPHAT_EXTRA_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) ||
      RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower)
    ) {
      return null;
    }
    if (segments.some((s) => /_dm\d+$/i.test(s.replace(/\.html?$/i, '')))) {
      return null;
    }
    if (segments.length > 1 && !isDirectRoutePrefix) {
      const lastClean = lastRaw.replace(/\.html?$/i, '');
      if (!lastClean) return null;
      const rawKey = [...segments.slice(0, -1), lastClean].join('/');
      const rawKeyLower = rawKey.toLowerCase();
      if (
        rawKey.length < 3 ||
        rawKey.length > 512 ||
        rawKeyLower.includes('..') ||
        ANPHAT_DESK_PHONE_SLUG_REGEX.test(rawKeyLower) ||
        RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX.test(rawKeyLower) ||
        ANPHAT_INFO_SUFFIX_REGEX.test(lastClean.toLowerCase())
      ) {
        return null;
      }
      return sanitizeAnPhatItemId(rawKey) || null;
    }
  }

  if (
    !isCollectionProductPath &&
    RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower)
  ) {
    return null;
  }

  const lastSeg = lastRaw.replace(/\.html?$/i, '') || null;
  const lastSegLower = (lastSeg || '').toLowerCase();
  const vtsHasPid =
    retailPlatform === 'viettelstore' &&
    /(?:^|-)pid[1-9]\d{1,14}$/i.test(lastSegLower);
  if (
    !lastSeg ||
    lastSeg.length < 2 ||
    lastSeg.length > 256 ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(lastSegLower) ||
    lastSegLower.includes('..') ||
    /^(?:0+|null|undefined|nan|infinity|-infinity|true|false|default|index|home|trang-chu|404|page-not-found|error)$/i.test(
      lastSegLower
    ) ||
    RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(lastSegLower) ||
    RETAIL_CATEGORY_ROOT_SLUGS.has(lastSegLower) ||
    RETAIL_BRAND_LISTING_SLUGS.has(lastSegLower) ||
    RETAIL_AUTH_OR_NON_PRODUCT_SLUG_REGEX.test(lastSegLower) ||
    isSeriesListingSlug(lastSegLower) ||
    (retailPlatform === 'hacom' &&
      HACOM_CATEGORY_BRAND_SLUG_REGEX.test(lastSegLower)) ||
    (retailPlatform === 'clickbuy' &&
      CLICKBUY_NON_PRODUCT_SLUG_REGEX.test(lastSegLower)) ||
    (retailPlatform === 'viettelstore' &&
      !vtsHasPid &&
      (VIETTELSTORE_NON_PRODUCT_PREFIXES.has(lastSegLower) ||
        VIETTELSTORE_CATEGORY_SLUG_REGEX.test(lastSegLower))) ||
    (retailPlatform === 'anphatpc' &&
      (ANPHAT_DESK_PHONE_SLUG_REGEX.test(lastSegLower) ||
        ANPHAT_INFO_SUFFIX_REGEX.test(lastSegLower)))
  ) {
    return null;
  }

  if (retailPlatform === 'anphatpc' && lastSeg.length > 120) {
    return sanitizeAnPhatItemId(lastSeg) || null;
  }

  return lastSeg.length <= 120 ? lastSeg : null;
}

export function extractIdsFromUrl(
  platform: SupportedEcommercePlatform,
  canonicalUrl: string
): { externalItemId: string | null; externalShopId: string | null } {
  if (typeof canonicalUrl !== 'string' || !canonicalUrl.trim()) {
    return { externalItemId: null, externalShopId: null };
  }
  const isPositiveDigits = (s: string | undefined): s is string =>
    Boolean(s && s.length <= 24 && !/^0+$/.test(s));

  if (platform === 'shopee') {
    const m =
      canonicalUrl.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
      canonicalUrl.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
    if (m && isPositiveDigits(m[1]) && isPositiveDigits(m[2])) {
      return {
        externalShopId: m[1],
        externalItemId: m[2],
      };
    }
    return { externalItemId: null, externalShopId: null };
  }

  if (platform === 'lazada') {
    const m = canonicalUrl.match(/-i(\d+)(?:-s(\d+))?\.html/i);
    if (m && isPositiveDigits(m[1])) {
      return {
        externalItemId: m[1],
        externalShopId: isPositiveDigits(m[2]) ? m[2] : null,
      };
    }
    return { externalItemId: null, externalShopId: null };
  }

  if (platform === 'tiki') {
    const m = canonicalUrl.match(/-p(\d+)\.html/i);
    if (m && isPositiveDigits(m[1])) {
      return {
        externalItemId: m[1],
        externalShopId: null,
      };
    }
    return { externalItemId: null, externalShopId: null };
  }

  if (platform === 'tiktok') {
    if (/\/video\/\d+/i.test(canonicalUrl)) {
      return { externalItemId: null, externalShopId: null };
    }
    const prodMatch =
      canonicalUrl.match(/\/product\/(\d+)/i) ||
      canonicalUrl.match(/\/view\/product\/(\d+)/i) ||
      // TikTok Shop's newer product pages (DOS/Rate#1245).
      canonicalUrl.match(/\/shop\/(?:[a-z]{2}\/)?pdp\/[^/]+\/(\d+)/i);
    const shopMatch = canonicalUrl.match(/\/@([a-zA-Z0-9_.-]+)/);
    const itemId = isPositiveDigits(prodMatch?.[1]) ? prodMatch![1]! : null;
    const rawShop = shopMatch?.[1] || '';
    const shopId =
      rawShop &&
      rawShop.length <= 64 &&
      /[a-zA-Z0-9]/.test(rawShop) &&
      !rawShop.startsWith('.') &&
      !rawShop.endsWith('.') &&
      !rawShop.includes('..')
        ? rawShop
        : null;
    return {
      externalItemId: itemId,
      externalShopId: shopId,
    };
  }

  // Validate pathname segments across all 18 Vietnamese retail chains
  let pathname = canonicalUrl;
  try {
    pathname = new URL(canonicalUrl).pathname;
  } catch {
    // Keep raw pathname if already relative
  }
  const segments = pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    externalItemId: extractValidRetailItemSlug(platform, segments),
    externalShopId: null,
  };
}

export function parseVndPriceText(
  rawText?: string | number | null
): number | null {
  if (typeof rawText === 'number') {
    if (
      !Number.isFinite(rawText) ||
      rawText < 10_000 ||
      rawText > 500_000_000
    ) {
      return null;
    }
    return Math.round(rawText);
  }
  if (typeof rawText !== 'string' || !rawText) return null;
  const trimmed = rawText
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .replace(/^~\s*/, '');
  if (!trimmed) return null;
  // Reject leading negative voucher/discount strings (e.g. "-50.000d", "\u22122.000.000d")
  if (
    /^(?:(?:\u20ab|\u0111|vnd)\s*)?[-\u2212\u2013\u2014\ufe63\uff0d]/iu.test(
      trimmed
    )
  ) {
    return null;
  }
  // Extract first price when a range like "28.990.000₫ - 34.990.000₫" or "28.990.000₫ ~ 34.990.000₫" is displayed
  const firstSegment =
    trimmed.split(/[-\u2212\u2013\u2014\ufe63\uff0d~]/u)[0]?.trim() ?? '';
  const withoutCurrency = firstSegment.replace(/[^\d.,]/g, '');
  if (!withoutCurrency) return null;
  // Handle plain decimal string like "28990000.00" or thousand-separated decimal "28,990,000.00"
  const strippedFraction = withoutCurrency.replace(/[.,]\d{1,2}$/, '');
  const digits = strippedFraction.replace(/[^\d]/g, '');
  if (!digits) return null;
  const num = Number(digits);
  if (!Number.isFinite(num) || num < 10_000 || num > 500_000_000) {
    return null;
  }
  return num;
}

const JSON_LD_PRODUCT_TYPES = new Set([
  'product',
  'productgroup',
  'individualproduct',
  'productmodel',
]);

const MAX_JSON_LD_ENTITIES = 100;
const MAX_JSON_LD_OFFERS = 100;

export function flattenJsonLdEntities(
  raw: unknown,
  depth = 0
): Record<string, unknown>[] {
  if (!raw || depth > 3) return [];
  if (Array.isArray(raw)) {
    const out: Record<string, unknown>[] = [];
    for (const entry of raw) {
      if (out.length >= MAX_JSON_LD_ENTITIES) break;
      const nested = flattenJsonLdEntities(entry, depth + 1);
      for (const item of nested) {
        if (out.length >= MAX_JSON_LD_ENTITIES) break;
        out.push(item);
      }
    }
    return out;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: Record<string, unknown>[] = [obj];
    if (Array.isArray(obj['@graph'])) {
      const nested = flattenJsonLdEntities(obj['@graph'], depth + 1);
      for (const item of nested) {
        if (out.length >= MAX_JSON_LD_ENTITIES) break;
        out.push(item);
      }
    }
    return out;
  }
  return [];
}

export function isJsonLdProductEntity(item: Record<string, unknown>): boolean {
  const rawType = item['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((t) => {
    if (typeof t !== 'string') return false;
    const normalized = t
      .trim()
      .replace(/^https?:\/\/schema\.org\//i, '')
      .toLowerCase();
    return JSON_LD_PRODUCT_TYPES.has(normalized);
  });
}

export function extractPriceFromJsonLdOffers(offersRaw: unknown): {
  price: number | null;
  originalPrice: number | null;
} {
  if (!offersRaw || typeof offersRaw !== 'object') {
    return { price: null, originalPrice: null };
  }
  const candidates: Record<string, unknown>[] = [];
  const pushOffer = (entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      candidates.length >= MAX_JSON_LD_OFFERS
    ) {
      return;
    }
    const obj = entry as Record<string, unknown>;
    candidates.push(obj);
    if (Array.isArray(obj.offers)) {
      for (const nested of obj.offers) {
        if (candidates.length >= MAX_JSON_LD_OFFERS) break;
        if (nested && typeof nested === 'object') {
          candidates.push(nested as Record<string, unknown>);
        }
      }
    }
  };

  if (Array.isArray(offersRaw)) {
    for (const entry of offersRaw) {
      if (candidates.length >= MAX_JSON_LD_OFFERS) break;
      pushOffer(entry);
    }
  } else {
    pushOffer(offersRaw);
  }

  let resolvedPrice: number | null = null;
  let resolvedHighPrice: number | null = null;

  for (const offer of candidates) {
    const priceSpec =
      offer.priceSpecification && typeof offer.priceSpecification === 'object'
        ? (offer.priceSpecification as Record<string, unknown>)
        : Array.isArray(offer.priceSpecification) &&
            offer.priceSpecification[0] &&
            typeof offer.priceSpecification[0] === 'object'
          ? (offer.priceSpecification[0] as Record<string, unknown>)
          : null;

    const rawPriceCandidate =
      offer.price ?? offer.lowPrice ?? priceSpec?.price ?? null;
    if (
      resolvedPrice === null &&
      (typeof rawPriceCandidate === 'string' ||
        typeof rawPriceCandidate === 'number')
    ) {
      const parsed = parseVndPriceText(rawPriceCandidate);
      if (parsed) {
        resolvedPrice = parsed;
      }
    }

    const rawHighCandidate = offer.highPrice ?? null;
    if (
      resolvedHighPrice === null &&
      (typeof rawHighCandidate === 'string' ||
        typeof rawHighCandidate === 'number')
    ) {
      const parsedHigh = parseVndPriceText(rawHighCandidate);
      if (parsedHigh) {
        resolvedHighPrice = parsedHigh;
      }
    }
  }

  const validOriginal =
    resolvedHighPrice !== null &&
    (resolvedPrice === null || resolvedHighPrice > resolvedPrice)
      ? resolvedHighPrice
      : null;

  return { price: resolvedPrice, originalPrice: validOriginal };
}

/**
 * A schema.org availability (`https://schema.org/InStock`, `schema:InStock`,
 * `InStock`, or a page's own "in stock" text) as a stock state; null when it
 * says nothing (DOS/Rate#1606). Pre-orders and back-orders are unknown, not
 * in stock. An array gives its first string.
 */
export function stockStateFromAvailability(
  raw: unknown
): ExtractedStockState | null {
  const first = Array.isArray(raw)
    ? raw.find((v): v is string => typeof v === 'string')
    : raw;
  if (typeof first !== 'string' || first.length > 200) return null;
  const v = first
    .toLowerCase()
    .replace(/^(?:https?:\/\/(?:www\.)?schema\.org\/|schema:)/, '')
    .replace(/[\s_-]+/g, '');
  if (!v) return null;
  if (/^(?:instock|instoreonly|onlineonly|available)$/.test(v)) {
    return 'in_stock';
  }
  if (/^(?:limitedavailability|lowstock)$/.test(v)) return 'low_stock';
  if (/^(?:outofstock|soldout|discontinued|reserved|oos)$/.test(v)) {
    return 'out_of_stock';
  }
  if (
    /^(?:preorder|presale|backorder|madetoorder|availablefororder)$/.test(v)
  ) {
    return 'unknown';
  }
  return null;
}

function stockQtyOf(raw: unknown): number | null {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).value
      : raw;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{1,7}$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

/** The offers of a JSON-LD `offers` value, nested AggregateOffer ones too. */
export function jsonLdOfferList(offersRaw: unknown): Record<string, unknown>[] {
  const offers: Record<string, unknown>[] = [];
  const push = (entry: unknown) => {
    if (
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      offers.length < MAX_JSON_LD_OFFERS
    ) {
      offers.push(entry as Record<string, unknown>);
    }
  };
  for (const entry of Array.isArray(offersRaw) ? offersRaw : [offersRaw]) {
    const nested = (entry as { offers?: unknown } | null)?.offers;
    if (nested && typeof nested === 'object') {
      (Array.isArray(nested) ? nested : [nested]).forEach(push);
      if (!(entry as { availability?: unknown }).availability) continue;
    }
    push(entry);
  }
  return offers;
}

/**
 * The stock of one offer. A quantity is kept only when it agrees with the
 * state: none for an unknown state, 0 for out of stock, and none for an
 * "in stock" offer that says 0.
 */
export function stockOfOffer(offer: Record<string, unknown> | null): {
  stockState: ExtractedStockState | null;
  stockQty: number | null;
} {
  const stockState = offer
    ? stockStateFromAvailability(offer.availability)
    : null;
  if (!stockState || stockState === 'unknown') {
    return { stockState, stockQty: null };
  }
  if (stockState === 'out_of_stock') return { stockState, stockQty: 0 };
  const qty = stockQtyOf(offer?.inventoryLevel);
  return { stockState, stockQty: qty === 0 ? null : qty };
}

/** Stock state and quantity from JSON-LD offers: the first offer that says. */
export function extractStockFromJsonLdOffers(offersRaw: unknown): {
  stockState: ExtractedStockState | null;
  stockQty: number | null;
} {
  for (const offer of jsonLdOfferList(offersRaw)) {
    const stock = stockOfOffer(offer);
    if (stock.stockState) return stock;
  }
  return { stockState: null, stockQty: null };
}

function tokenizeVariantText(raw: string): string[] {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/(\d)\s+(gb|tb|mb|mm)\b/gu, '$1$2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function matchesVariantSku(rawSku: unknown, selectedVariant: string): boolean {
  if (typeof rawSku !== 'string') return false;
  const sku = rawSku.normalize('NFC').trim().toLowerCase();
  const wanted = selectedVariant.normalize('NFC').trim().toLowerCase();
  if (!sku || !wanted) return false;
  if (sku === wanted) return true;
  if (/^\d+$/.test(sku)) return false;
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`,
    'u'
  ).test(wanted);
}

/**
 * The offer of the selected variant: the only offer, or the one whose sku or
 * name matches the selected variant by whole tokens; null when several offers
 * and none can be told apart, so stock and SKU are not read off another variant.
 */
export function pickVariantOffer(
  offers: readonly Record<string, unknown>[],
  selectedVariant: string | null
): Record<string, unknown> | null {
  if (offers.length === 1) return offers[0] ?? null;
  if (!selectedVariant) return null;
  const wantedTokens = tokenizeVariantText(selectedVariant);
  if (wantedTokens.length === 0) return null;
  const wantedSet = new Set(wantedTokens);
  const wantedLower = selectedVariant.normalize('NFC').trim().toLowerCase();

  const exactMatches: Record<string, unknown>[] = [];
  const subsetCandidates: Array<{
    offer: Record<string, unknown>;
    overlap: number;
  }> = [];

  for (const offer of offers) {
    const isExactSku =
      typeof offer.sku === 'string' &&
      offer.sku.trim().length > 0 &&
      offer.sku.normalize('NFC').trim().toLowerCase() === wantedLower;
    const nameTokens =
      typeof offer.name === 'string' ? tokenizeVariantText(offer.name) : [];
    const nameSet = new Set(nameTokens);
    const isExactName =
      nameSet.size > 0 &&
      nameSet.size === wantedSet.size &&
      [...nameSet].every((tok) => wantedSet.has(tok));

    if (isExactSku || isExactName) {
      exactMatches.push(offer);
      continue;
    }

    const nameSubset =
      nameSet.size > 0 &&
      ([...nameSet].every((tok) => wantedSet.has(tok)) ||
        [...wantedSet].every((tok) => nameSet.has(tok)));
    const skuAllowed =
      matchesVariantSku(offer.sku, selectedVariant) &&
      (nameSet.size === 0 || nameSubset);
    if (skuAllowed || nameSubset) {
      const candidateTokens = new Set<string>(nameSubset ? nameSet : []);
      if (skuAllowed && typeof offer.sku === 'string') {
        for (const tok of tokenizeVariantText(offer.sku)) {
          candidateTokens.add(tok);
        }
      }
      let matchedWanted = 0;
      for (const tok of wantedSet) {
        if (candidateTokens.has(tok)) matchedWanted += 1;
      }
      const overlap = Math.max(skuAllowed ? 1 : 0, matchedWanted);
      subsetCandidates.push({ offer, overlap });
    }
  }

  if (exactMatches.length > 0) {
    return exactMatches.length === 1 ? (exactMatches[0] ?? null) : null;
  }
  if (subsetCandidates.length === 0) return null;
  const bestOverlap = Math.max(...subsetCandidates.map((c) => c.overlap));
  const best = subsetCandidates.filter((c) => c.overlap === bestOverlap);
  return best.length === 1 ? (best[0]?.offer ?? null) : null;
}

const SKU_ID_RE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

/**
 * The id of the selected variant: from the URL where the store puts it there
 * (Lazada `-s<id>.html`, Tiki `?spid=`), else the given structured-data sku
 * (DOS/Rate#1606). `rawUrl` is the page URL before cleaning, since Tiki keeps
 * it in the query.
 */
export function extractSkuId(
  platform: SupportedEcommercePlatform,
  rawUrl: string,
  jsonLdSku: unknown
): string | null {
  try {
    const url = new URL(rawUrl);
    if (platform === 'lazada') {
      const m = url.pathname.match(/-s(\d{1,20})\.html$/i);
      if (m?.[1]) return m[1];
    }
    if (platform === 'tiki') {
      const spid = url.searchParams.get('spid');
      if (spid && /^\d{1,20}$/.test(spid)) return spid;
    }
  } catch {
    // Fall through to the structured data.
  }
  const sku =
    typeof jsonLdSku === 'number' && Number.isInteger(jsonLdSku)
      ? String(jsonLdSku)
      : typeof jsonLdSku === 'string'
        ? jsonLdSku.trim()
        : '';
  return SKU_ID_RE.test(sku) ? sku : null;
}

export function extractRatingFromJsonLd(aggRaw: unknown): {
  ratingStar: number | null;
  ratingCount: number | null;
} {
  if (!aggRaw || typeof aggRaw !== 'object') {
    return { ratingStar: null, ratingCount: null };
  }
  const agg = aggRaw as Record<string, unknown>;
  const rawVal = agg.ratingValue;
  const rawBest = agg.bestRating;
  const rawCnt = agg.reviewCount ?? agg.ratingCount;

  const parseDecimal = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const normalized = v.trim().replace(',', '.');
      return Number(normalized);
    }
    return NaN;
  };

  let ratingStar: number | null = null;
  const rVal = parseDecimal(rawVal);
  const bestRating = parseDecimal(rawBest);
  if (Number.isFinite(rVal) && rVal > 0) {
    let scaled = rVal;
    if (Number.isFinite(bestRating) && bestRating > 5 && rVal <= bestRating) {
      scaled = (rVal / bestRating) * 5;
    } else if (rVal > 5 && rVal <= 10) {
      scaled = rVal / 2;
    } else if (rVal > 10 && rVal <= 100) {
      scaled = rVal / 20;
    }
    if (scaled > 0 && scaled <= 5) {
      ratingStar = Number(scaled.toFixed(2));
    }
  }

  let ratingCount: number | null = null;
  if (
    typeof rawCnt === 'number' &&
    Number.isFinite(rawCnt) &&
    rawCnt > 0 &&
    rawCnt <= 100_000_000
  ) {
    ratingCount = Math.round(rawCnt);
  } else if (typeof rawCnt === 'string') {
    const strippedFraction = rawCnt.trim().replace(/[.,]\d{1,2}$/, '');
    const digits = strippedFraction.replace(/[^\d]/g, '');
    const parsedCnt = digits ? Number(digits) : NaN;
    if (
      Number.isFinite(parsedCnt) &&
      parsedCnt > 0 &&
      parsedCnt <= 100_000_000
    ) {
      ratingCount = Math.round(parsedCnt);
    }
  }

  return { ratingStar, ratingCount };
}

export function cleanExtractedProductTitle(rawTitle: string): string {
  if (typeof rawTitle !== 'string') return '';
  // Bound code points and collapse whitespace first so suffix matching stays strictly O(N).
  const normalizedTitle = sliceCodePoints(stripLoneSurrogates(rawTitle), 2048)
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim();
  if (!normalizedTitle) return '';
  const withoutPlatformSuffix = normalizedTitle
    .replace(
      / ?(?:\||[-\u2013\u2014]) ?(?:Shopee(?:\s*Việt\s*Nam|\s*VN)?|Lazada(?:\s*Việt\s*Nam|\s*VN)?|Tiki(?:\.vn)?|TikTok\s*Shop|CellphoneS(?:\.com\.vn)?|Thế\s*Giới\s*Di\s*Động|Thegioididong(?:\.com)?|TopZone(?:\.vn)?|Điện\s*Máy\s*Xanh|Dienmayxanh(?:\.com)?|FPT\s*Shop|Fptshop(?:\.com\.vn)?|Hoàng\s*Hà\s*Mobile|HoangHaMobile(?:\.com)?|Di\s*Động\s*Việt|Didongviet(?:\.vn)?|Phong\s*Vũ|Phongvu(?:\.vn)?|GearVN(?:\.com)?|Nguy\u1ec5n\s*Kim|Nguyenkim(?:\.com)?|ShopDunk(?:\.com)?|HACOM(?:\.vn)?|Hanoicomputer(?:\.vn)?|Clickbuy(?:\.com\.vn)?|Viettel\s*Store|Viettelstore(?:\.vn)?|Si\u00eau\s*th\u1ecb\s*\u0111i\u1ec7n\s*m\u00e1y\s*Pico|Pico(?:\.vn)?|Media\s*Mart|Mediamart(?:\.vn)?|MemoryZone(?:\.com\.vn)?|An\s*Ph\u00e1t(?:\s*Computer|\s*PC)?|Anphatpc(?:\.com\.vn)?).*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutPlatformSuffix.includes('|')) {
    return sliceCodePoints(withoutPlatformSuffix, 500);
  }

  const pipeSegments = withoutPlatformSuffix
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (pipeSegments.length === 0) return '';

  const keptSegments: string[] = [pipeSegments[0]!];
  for (let i = 1; i < pipeSegments.length; i++) {
    const seg = pipeSegments[i]!;
    if (/\b\d+\s*(?:GB|TB)\b/i.test(seg)) {
      keptSegments.push(seg);
    }
  }

  return sliceCodePoints(
    keptSegments.join(' ').replace(/\s+/g, ' ').trim(),
    500
  );
}

const CONCRETE_WAI_ARIA_ROLES = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'button',
  'caption',
  'cell',
  'checkbox',
  'code',
  'columnheader',
  'combobox',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'link',
  'list',
  'listbox',
  'listitem',
  'log',
  'main',
  'mark',
  'marquee',
  'math',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'radio',
  'radiogroup',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'searchbox',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'strong',
  'subscript',
  'suggestion',
  'superscript',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'textbox',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
]);

/**
 * Extract active/selected storage variant from the host page DOM
 * so multi-variant listings (128GB / 256GB / 512GB / 1TB) are disambiguated.
 */
export function extractSelectedVariantFromDom(doc: Document): string | null {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const selectors = [
    // Shopee active tier variation button
    'button.product-variation--selected',
    'button[aria-checked="true"]',
    // Lazada / Tiki active SKU option
    '.sku-variable-name-selected',
    '[data-view-id="pdp_main_select_configuration_item"].active',
    // CellphoneS / TGDD / FPT Shop active capacity box
    '.box-linked .item.active',
    '.scrolling_inner .box03__item.act',
    '.st-select__item.active',
  ];

  const pickedLabels: string[] = [];
  const seenLower = new Set<string>();
  for (const sel of selectors) {
    const nodes = doc.querySelectorAll(sel);
    nodes.forEach((node) => {
      const rawRole =
        (typeof node.getAttribute === 'function'
          ? node.getAttribute('role')
          : null) ??
        (typeof (node as { role?: unknown }).role === 'string'
          ? (node as { role: string }).role
          : null);
      if (typeof rawRole === 'string') {
        const effectiveRole =
          rawRole
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .find((token) => CONCRETE_WAI_ARIA_ROLES.has(token)) ?? null;
        if (effectiveRole === 'switch' || effectiveRole === 'checkbox') {
          return;
        }
      }
      const txt = stripLoneSurrogates(node.textContent || '')
        .replace(/\p{Cc}+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (txt && txt.length <= 60) {
        const key = txt.toLowerCase();
        if (!seenLower.has(key)) {
          seenLower.add(key);
          pickedLabels.push(txt);
        }
      }
    });
  }

  if (pickedLabels.length > 0) {
    return sliceCodePoints(pickedLabels.join(' - '), 200) || null;
  }
  return null;
}

/**
 * Extract product signal from the current DOM + JSON-LD structured data without blocking the main thread.
 */
export function extractProductSignalFromDom(
  doc: Document,
  currentUrl: string
): ExtractedPageProductSignal | null {
  const canonicalUrl = sanitizeProductUrl(currentUrl);
  if (!canonicalUrl) return null;

  const platform = detectEcommercePlatform(canonicalUrl);
  if (!platform) return null;

  const { externalItemId, externalShopId } = extractIdsFromUrl(
    platform,
    canonicalUrl
  );

  // Skip homepage, category index, blog, or search pages that do not resolve to a product item ID
  const path = new URL(canonicalUrl).pathname;
  if (!path || path === '/' || path.startsWith('/search') || !externalItemId) {
    return null;
  }

  let title = '';
  let price: number | null = null;
  let originalPrice: number | null = null;
  let ratingStar: number | null = null;
  let ratingCount: number | null = null;
  // The first JSON-LD product's offers and sku (DOS/Rate#1606).
  let productOffers: Record<string, unknown>[] | null = null;
  let productSku: unknown = null;
  let priceFromJsonLd = false;
  let originalFromDom = false;

  // 1. Try JSON-LD Product structured data first (cleanest & resilient across SPA updates)
  const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  ldScripts.forEach((script) => {
    try {
      const raw = JSON.parse(script.textContent || '{}');
      const items = flattenJsonLdEntities(raw);
      for (const item of items) {
        if (isJsonLdProductEntity(item)) {
          if (!title && typeof item.name === 'string') {
            title = cleanExtractedProductTitle(item.name);
          }
          if (productOffers === null) {
            productOffers = jsonLdOfferList(item.offers);
            productSku = item.sku ?? null;
          }
          if (!price || !originalPrice) {
            const offerPrices = extractPriceFromJsonLdOffers(item.offers);
            if (!price && offerPrices.price) {
              price = offerPrices.price;
              priceFromJsonLd = true;
            }
            if (
              !originalPrice &&
              offerPrices.originalPrice &&
              (!price || offerPrices.originalPrice > price)
            ) {
              originalPrice = offerPrices.originalPrice;
            }
          }
          if (item.aggregateRating && (!ratingStar || !ratingCount)) {
            const parsedRating = extractRatingFromJsonLd(item.aggregateRating);
            if (!ratingStar && parsedRating.ratingStar) {
              ratingStar = parsedRating.ratingStar;
            }
            if (!ratingCount && parsedRating.ratingCount) {
              ratingCount = parsedRating.ratingCount;
            }
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  });

  // 2. Fallback to DOM H1 / document title
  if (!title) {
    const h1 = doc.querySelector('h1');
    title = cleanExtractedProductTitle(h1?.textContent || doc.title || '');
  }

  if (!title || title.length < 3) {
    return null;
  }

  // 3. Fallback / supplement current price & strikethrough originalPrice from DOM
  const priceSelectors = [
    '.pqTWkA',
    '.IZPeQz.B67UQ0',
    '[data-testid="pdp-product-price"]',
    '.pdp-price_type_normal',
    '.product-price__current-price',
    '.product-price .pro-price',
    '.product_info_price_value-final',
    '.overview .prices .actual-price',
    '.pdp-price-online',
    '.product-detail-price .price-sale',
    '.cb-pbox__now:not([hidden])',
    '.wrap-price .new-price',
    '.special-price .price:not(.related-products *):not(.product-item *):not(.product-card *):not(.product-box *):not(header *):not(footer *)',
    '.tpt---sale-price',
    '.box-price-present',
  ];
  if (!price) {
    for (const sel of priceSelectors) {
      const el = doc.querySelector(sel);
      const parsed = parseVndPriceText(el?.textContent);
      if (parsed) {
        price = parsed;
        break;
      }
    }
  }

  const originalPriceSelectors = [
    '.Y3DvsN',
    '.ZA5sW5',
    '.pdp-price_type_deleted',
    '.product-price__original-price',
    '.product-price .pro-price-del',
    '.product_info_price_value-real',
    '.overview .old-product-price',
    '.pdp-price-old',
    '.product-detail-price .price-old',
    '.cb-pbox__old:not([hidden])',
    '.wrap-price .old-price',
    '.product-price-regular:not(.related-products *):not(.product-item *):not(.product-card *):not(.product-box *):not(header *):not(footer *)',
    '.old-price .price:not(.related-products *):not(.product-item *):not(.product-card *):not(.product-box *):not(header *):not(footer *)',
    '.tpt---price-through',
    '.box-price-old',
    'del',
  ];
  for (const sel of originalPriceSelectors) {
    const el = doc.querySelector(sel);
    const parsed = parseVndPriceText(el?.textContent);
    if (parsed && (!price || parsed > price)) {
      originalPrice = parsed;
      originalFromDom = true;
      break;
    }
  }

  const selectedVariant = extractSelectedVariantFromDom(doc);

  // 4. Stock and SKU from the selected variant's offer only, so they never
  // describe another variant; then the page's product meta for the stock.
  const offers = productOffers ?? [];
  const offer = pickVariantOffer(offers, selectedVariant);
  let { stockState, stockQty } = stockOfOffer(offer);
  const stockFromJsonLd = stockState !== null;
  if (!stockState && offers.length <= 1) {
    const meta = doc.querySelector(
      'meta[property="product:availability"], meta[property="og:availability"]'
    );
    ({ stockState, stockQty } = stockOfOffer({
      availability: meta?.getAttribute('content'),
    }));
  }
  const jsonLdSku =
    offer?.sku ?? (offers.length <= 1 ? productSku : null) ?? null;

  // Where the fields v1 carries came from: price, list price and stock.
  const sources = [
    price !== null ? priceFromJsonLd : null,
    originalPrice !== null ? !originalFromDom : null,
    stockState !== null ? stockFromJsonLd : null,
  ].filter((v): v is boolean => v !== null);
  return {
    platform,
    canonicalUrl,
    externalItemId,
    externalShopId,
    title,
    selectedVariant,
    price,
    originalPrice,
    ratingStar,
    ratingCount,
    skuId: extractSkuId(platform, currentUrl, jsonLdSku),
    stockState: stockState ?? 'unknown',
    stockQty: stockState ? stockQty : null,
    extractorSource:
      sources.length > 0 && sources.every(Boolean)
        ? 'json_ld'
        : sources.some(Boolean)
          ? 'mixed'
          : 'dom',
  };
}
