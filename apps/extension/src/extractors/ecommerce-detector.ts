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
    isDomainOrSubdomain(host, 'topzone.vn')
  ) {
    return 'tgdd';
  }
  if (isDomainOrSubdomain(host, 'fptshop.com.vn')) return 'fptshop';
  if (isDomainOrSubdomain(host, 'hoanghamobile.com')) return 'hoangha';
  if (isDomainOrSubdomain(host, 'didongviet.vn')) return 'didongviet';
  if (isDomainOrSubdomain(host, 'phongvu.vn')) return 'phongvu';
  return null;
}

export function extractIdsFromUrl(
  platform: SupportedEcommercePlatform,
  canonicalUrl: string
): { externalItemId: string | null; externalShopId: string | null } {
  if (platform === 'shopee') {
    const m =
      canonicalUrl.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
      canonicalUrl.match(/\/product\/(\d+)\/(\d+)/i);
    if (m) {
      return {
        externalShopId: m[1] || null,
        externalItemId: m[2] || null,
      };
    }
  }

  if (platform === 'lazada') {
    const m = canonicalUrl.match(/-i(\d+)(?:-s(\d+))?\.html/i);
    if (m) {
      return {
        externalItemId: m[1] || null,
        externalShopId: m[2] || null,
      };
    }
  }

  if (platform === 'tiki') {
    const m = canonicalUrl.match(/-p(\d+)\.html/i);
    if (m) {
      return {
        externalItemId: m[1] || null,
        externalShopId: null,
      };
    }
  }

  if (platform === 'tiktok') {
    const prodMatch =
      canonicalUrl.match(/\/product\/(\d+)/i) ||
      canonicalUrl.match(/\/view\/product\/(\d+)/i) ||
      canonicalUrl.match(/\/video\/(\d+)/i);
    const shopMatch = canonicalUrl.match(/\/@([a-zA-Z0-9_.-]+)/);
    return {
      externalItemId: prodMatch?.[1] || null,
      externalShopId: shopMatch?.[1] || null,
    };
  }

  // For CellphoneS / TGDD / FPT Shop / Hoàng Hà / Di Động Việt / Phong Vũ, use the last pathname slug as item identifier
  const parts = canonicalUrl.split('/').filter(Boolean);
  const lastSegment = parts[parts.length - 1]?.replace(/\.html?$/i, '') || null;
  return {
    externalItemId: lastSegment,
    externalShopId: null,
  };
}

export function parseVndPriceText(rawText?: string | null): number | null {
  if (!rawText) return null;
  // Extract first price when a range like "28.990.000₫ - 34.990.000₫" is displayed
  const firstSegment = rawText.split('-')[0] || rawText;
  const digits = firstSegment.replace(/[^\d]/g, '');
  if (!digits) return null;
  const num = Number(digits);
  if (!Number.isFinite(num) || num < 10_000 || num > 500_000_000) {
    return null;
  }
  return num;
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

  // Skip homepage or search pages that do not look like a product page
  const path = new URL(canonicalUrl).pathname;
  if (!path || path === '/' || path.startsWith('/search')) {
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
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        if (
          item &&
          (item['@type'] === 'Product' || item['@type'] === 'ProductGroup')
        ) {
          if (!title && typeof item.name === 'string') {
            title = item.name.trim();
          }
          const offers = Array.isArray(item.offers)
            ? item.offers[0]
            : item.offers;
          if (offers) {
            const p = Number(offers.price || offers.lowPrice || 0);
            if (!price && p >= 10_000) {
              price = Math.round(p);
            }
          }
          if (item.aggregateRating) {
            const rVal = Number(item.aggregateRating.ratingValue || 0);
            const rCnt = Number(
              item.aggregateRating.reviewCount ||
                item.aggregateRating.ratingCount ||
                0
            );
            if (rVal > 0 && rVal <= 5) ratingStar = rVal;
            if (rCnt > 0) ratingCount = rCnt;
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
    title = (h1?.textContent || doc.title || '')
      .replace(/\|.*$/, '')
      .replace(/-\s*Shopee.*$/i, '')
      .trim();
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
