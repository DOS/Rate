import type {
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from '../types.js';

/**
 * Strip all tracking query strings (sp_atk, xptdk, utm_*, fbclid, etc.) and hashes.
 */
export function sanitizeProductUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
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
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
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
  if (platform === 'shopee') {
    const m =
      canonicalUrl.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
      canonicalUrl.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
    if (m) {
      return {
        externalShopId: m[1] || null,
        externalItemId: m[2] || null,
      };
    }
    return { externalItemId: null, externalShopId: null };
  }

  if (platform === 'lazada') {
    const m = canonicalUrl.match(/-i(\d+)(?:-s(\d+))?\.html/i);
    if (m) {
      return {
        externalItemId: m[1] || null,
        externalShopId: m[2] || null,
      };
    }
    return { externalItemId: null, externalShopId: null };
  }

  if (platform === 'tiki') {
    const m = canonicalUrl.match(/-p(\d+)\.html/i);
    if (m) {
      return {
        externalItemId: m[1] || null,
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
    return {
      externalItemId: prodMatch?.[1] || null,
      externalShopId: shopMatch?.[1] || null,
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

export function flattenJsonLdEntities(
  raw: unknown,
  depth = 0
): Record<string, unknown>[] {
  if (!raw || depth > 3) return [];
  if (Array.isArray(raw)) {
    const out: Record<string, unknown>[] = [];
    for (const entry of raw) {
      out.push(...flattenJsonLdEntities(entry, depth + 1));
    }
    return out;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: Record<string, unknown>[] = [obj];
    if (Array.isArray(obj['@graph'])) {
      out.push(...flattenJsonLdEntities(obj['@graph'], depth + 1));
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
    if (!entry || typeof entry !== 'object') return;
    const obj = entry as Record<string, unknown>;
    candidates.push(obj);
    if (Array.isArray(obj.offers)) {
      for (const nested of obj.offers) {
        if (nested && typeof nested === 'object') {
          candidates.push(nested as Record<string, unknown>);
        }
      }
    }
  };

  if (Array.isArray(offersRaw)) {
    for (const entry of offersRaw) pushOffer(entry);
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
  if (typeof rawCnt === 'number' && Number.isFinite(rawCnt) && rawCnt > 0) {
    ratingCount = Math.round(rawCnt);
  } else if (typeof rawCnt === 'string') {
    const digits = rawCnt.replace(/[^\d]/g, '');
    const parsedCnt = digits ? Number(digits) : NaN;
    if (Number.isFinite(parsedCnt) && parsedCnt > 0) {
      ratingCount = Math.round(parsedCnt);
    }
  }

  return { ratingStar, ratingCount };
}

export function cleanExtractedProductTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\|.*$/, '')
    .replace(
      /\s*[-–—]\s*(?:Shopee|Lazada|Tiki|TikTok\s*Shop|CellphoneS|Thế\s*Giới\s*Di\s*Động|Thegioididong|TopZone|Điện\s*Máy\s*Xanh|FPT\s*Shop|Hoàng\s*Hà\s*Mobile|HoangHaMobile|Di\s*Động\s*Việt|Phong\s*Vũ).*$/i,
      ''
    )
    .trim();
}

/**
 * Extract active/selected storage variant from the host page DOM
 * so multi-variant listings (128GB / 256GB / 512GB / 1TB) are disambiguated.
 */
export function extractSelectedVariantFromDom(doc: Document): string | null {
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
  for (const sel of selectors) {
    const nodes = doc.querySelectorAll(sel);
    nodes.forEach((node) => {
      const txt = (node.textContent || '').trim();
      if (txt && txt.length <= 60) {
        pickedLabels.push(txt);
      }
    });
  }

  if (pickedLabels.length > 0) {
    return pickedLabels.join(' - ');
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
