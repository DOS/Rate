import type {
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from '../types.js';

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
  if (
    isDomainOrSubdomain(host, 'thegioididong.com') ||
    isDomainOrSubdomain(host, 'topzone.vn') ||
    isDomainOrSubdomain(host, 'dienmayxanh.com')
  ) {
    return 'tgdd';
  }
  if (isDomainOrSubdomain(host, 'fptshop.com.vn')) return 'fptshop';
  if (isDomainOrSubdomain(host, 'hoanghamobile.com')) return 'hoangha';
  if (isDomainOrSubdomain(host, 'didongviet.vn')) return 'didongviet';
  if (isDomainOrSubdomain(host, 'phongvu.vn')) return 'phongvu';
  return null;
}

const RETAIL_NON_PRODUCT_FIRST_SEGMENTS = new Set([
  'tin-tuc',
  'sforum',
  'dchannel',
  'hoi-dap',
  'khuyen-mai',
  'tra-gop',
  'bao-hanh',
  'he-thong-cua-hang',
  'he-thong-sieu-thi',
  'catalogsearch',
  'tim-kiem',
  'search',
  'cart',
  'gio-hang',
  'account',
  'login',
  'blog',
  'news',
  'event',
  'landing',
  'collection',
  'c',
]);

const RETAIL_CATEGORY_ROOT_SLUGS = new Set([
  'dtdd',
  'dien-thoai',
  'dien-thoai-di-dong',
  'mobile',
  'smartphones',
  'laptop',
  'laptops',
  'may-tinh-xach-tay',
  'may-tinh-bang',
  'tablet',
  'tablets',
  'dong-ho-thong-minh',
  'smartwatch',
  'smartwatches',
  'tai-nghe',
  'earbuds',
  'phu-kien',
  'apple',
  'iphone',
  'ipad',
  'macbook',
  'watch',
  'airpods',
]);

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
      canonicalUrl.match(/\/view\/product\/(\d+)/i);
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

  // For CellphoneS / TGDD / FPT Shop / Hoàng Hà / Di Động Việt / Phong Vũ, validate pathname segments
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
  const firstSegLower = (segments[0] || '')
    .replace(/\.html?$/i, '')
    .toLowerCase();
  const lastSegment =
    segments[segments.length - 1]?.replace(/\.html?$/i, '') || null;
  const lastSegLower = (lastSegment || '').toLowerCase();
  const isValidItemSlug =
    Boolean(lastSegment) &&
    lastSegment!.length >= 2 &&
    lastSegment!.length <= 120 &&
    /^[a-zA-Z0-9_.-]+$/.test(lastSegment!) &&
    /[a-zA-Z0-9]/.test(lastSegment!) &&
    !lastSegment!.startsWith('.') &&
    !lastSegment!.endsWith('.') &&
    !lastSegment!.includes('..') &&
    !RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(firstSegLower) &&
    !RETAIL_NON_PRODUCT_FIRST_SEGMENTS.has(lastSegLower) &&
    !(segments.length === 1 && RETAIL_CATEGORY_ROOT_SLUGS.has(firstSegLower)) &&
    !(platform === 'tgdd' && segments.length < 2);
  return {
    externalItemId: isValidItemSlug ? lastSegment : null,
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
  // Extract first price when a range like "28.990.000₫ - 34.990.000₫", "28.990.000₫ – 34.990.000₫", or "28.990.000₫ ~ 34.990.000₫" is displayed
  const firstSegment = (rawText.split(/[-–—~]/)[0] || rawText).trim();
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
  const withoutPlatformSuffix = rawTitle
    .replace(/\p{Cc}+/gu, ' ')
    .replace(
      /\s*(?:\||[-–—])\s*(?:Shopee(?:\s*Việt\s*Nam|\s*VN)?|Lazada(?:\s*Việt\s*Nam|\s*VN)?|Tiki(?:\.vn)?|TikTok\s*Shop|CellphoneS(?:\.com\.vn)?|Thế\s*Giới\s*Di\s*Động|Thegioididong(?:\.com)?|TopZone(?:\.vn)?|Điện\s*Máy\s*Xanh|FPT\s*Shop|Fptshop(?:\.com\.vn)?|Hoàng\s*Hà\s*Mobile|HoangHaMobile(?:\.com)?|Di\s*Động\s*Việt|Didongviet(?:\.vn)?|Phong\s*Vũ|Phongvu(?:\.vn)?).*$/i,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutPlatformSuffix.includes('|')) {
    return withoutPlatformSuffix.slice(0, 500);
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

  return keptSegments.join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

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
      const txt = (node.textContent || '')
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
    return pickedLabels.join(' - ').slice(0, 200);
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
          if (!price || !originalPrice) {
            const offerPrices = extractPriceFromJsonLdOffers(item.offers);
            if (!price && offerPrices.price) {
              price = offerPrices.price;
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
    '.tpt---price-through',
    '.box-price-old',
    'del',
  ];
  for (const sel of originalPriceSelectors) {
    const el = doc.querySelector(sel);
    const parsed = parseVndPriceText(el?.textContent);
    if (parsed && (!price || parsed > price)) {
      originalPrice = parsed;
      break;
    }
  }

  const selectedVariant = extractSelectedVariantFromDom(doc);

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
  };
}
