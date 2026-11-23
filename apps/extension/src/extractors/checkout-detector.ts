import type {
  CheckoutPriceTrapWarning,
  ExtensionLookupData,
  ExtensionOfferItem,
  ExtractedCartLineItem,
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from '../types.js';
import {
  DEFAULT_API_BASE_URL,
  MAX_VALID_EXTENSION_VND_PRICE,
  normalizeAllowedApiBaseUrl,
  roundHalfUpDecimal,
  sliceCodePoints,
  stripLoneSurrogates,
} from '../security-guards.js';
import {
  cleanExtractedProductTitle,
  extractIdsFromUrl,
  parseVndPriceText,
  sanitizeProductUrl,
} from './ecommerce-detector.js';

export const MAX_CART_LINE_ITEMS = 5;
export const CHECKOUT_MIN_SAVINGS_VND = 200_000;
export const CHECKOUT_MIN_SAVINGS_PCT = 5;
export const CHECKOUT_MIN_MARKUP_PCT = 15;
export const DEFAULT_CHECKOUT_CACHE_TTL_MS = 5 * 60_000;
export const DEFAULT_CHECKOUT_MAX_CONCURRENCY = 3;

/**
 * Exact hosts where `manifest.json` `content_scripts` execute cart/checkout
 * checks across the 22 supported Vietnamese stores.
 *
 * Privacy contract (#1601): on `www.tiktok.com` the content script matches ONLY
 * product detail paths (`/view/product/*`, `/@*\/product/*`, `/shop/*pdp/*`) and
 * never runs on general browsing, cart, or checkout routes; only `shop.tiktok.com`
 * (and the other 21 platforms) are eligible for cart/checkout URL detection.
 */
const ALLOWED_CHECKOUT_STORE_HOSTS: Readonly<
  Record<SupportedEcommercePlatform, readonly string[]>
> = {
  shopee: ['shopee.vn'],
  lazada: ['lazada.vn', '.lazada.vn'],
  tiki: ['tiki.vn'],
  tiktok: ['shop.tiktok.com'],
  cellphones: ['cellphones.com.vn'],
  tgdd: ['thegioididong.com', '.thegioididong.com'],
  dienmayxanh: ['dienmayxanh.com', '.dienmayxanh.com'],
  topzone: ['topzone.vn', '.topzone.vn'],
  fptshop: ['fptshop.com.vn'],
  hoangha: ['hoanghamobile.com'],
  didongviet: ['didongviet.vn'],
  phongvu: ['phongvu.vn'],
  gearvn: ['gearvn.com', '.gearvn.com'],
  nguyenkim: ['nguyenkim.com', '.nguyenkim.com'],
  shopdunk: ['shopdunk.com', '.shopdunk.com'],
  hacom: ['hacom.vn', '.hacom.vn'],
  clickbuy: ['clickbuy.com.vn', '.clickbuy.com.vn'],
  viettelstore: ['viettelstore.vn', '.viettelstore.vn'],
  pico: ['pico.vn', '.pico.vn'],
  mediamart: ['mediamart.vn', '.mediamart.vn'],
  memoryzone: ['memoryzone.com.vn', '.memoryzone.com.vn'],
  anphatpc: ['anphatpc.com.vn', '.anphatpc.com.vn'],
};

const MULTI_SELLER_MARKETPLACES: ReadonlySet<SupportedEcommercePlatform> =
  new Set<SupportedEcommercePlatform>(['shopee', 'lazada', 'tiki', 'tiktok']);

const CHECKOUT_OR_CART_SEGMENTS = new Set([
  'cart',
  'carts',
  'gio-hang',
  'giohang',
  'shopping-cart',
  'checkout',
  'checkouts',
  'onepagecheckout',
  'thanh-toan',
  'thanhtoan',
  'basket',
  'order',
  'send-order',
  'dat-hang',
]);

const CHECKOUT_SUBPATH_PREFIXES = new Set([
  'vi',
  'en',
  'cs',
  'vn',
  'shop',
  'view',
  'store',
]);

const CHECKOUT_STEP_SEGMENTS = new Set([
  'cart',
  'carts',
  'gio-hang',
  'checkout',
  'payment',
  'thanh-toan',
  'shipping',
  'giao-hang',
  'delivery',
  'review',
  'index',
  'step1',
  'step2',
  'step-1',
  'step-2',
]);

const NON_CHECKOUT_SEGMENTS = new Set([
  'login',
  'register',
  'account',
  'tai-khoan',
  'taikhoan',
  'user',
  'dang-nhap',
  'dang-ky',
  'logout',
  'dang-xuat',
  'auth',
  'captcha',
  'challenge',
  'history',
  'lich-su',
  'tracking',
  'tra-cuu',
  'tra-cuu-don-hang',
  'kiem-tra-don-hang',
  'don-hang-cua-toi',
  'success',
  'thank-you',
  'thankyou',
  'complete',
  'completed',
  'hoan-tat',
  'thanh-cong',
  'confirmation',
]);

const STATIC_ASSET_EXT_REGEX =
  /\.(?:js|mjs|cjs|json|css|xml|txt|pdf|zip|rar|7z|png|jpe?g|webp|avif|svg|gif|ico|woff2?|ttf|eot|map|mp[34]|webm)$/i;

export function foldCheckoutAscii(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]+/g, '')
    .replace(/\u0111/gi, 'd')
    .toLowerCase();
}

function matchesAllowedStoreHost(
  platform: SupportedEcommercePlatform,
  host: string
): boolean {
  const lower = host.toLowerCase();
  return ALLOWED_CHECKOUT_STORE_HOSTS[platform].some((allowed) => {
    if (!allowed.startsWith('.')) return lower === allowed;
    if (lower === allowed.slice(1)) return true;
    if (!lower.endsWith(allowed)) return false;
    const prefix = lower.slice(0, lower.length - allowed.length + 1);
    return /^(?:[a-z0-9-]+\.)+$/.test(prefix);
  });
}

export function detectCheckoutPlatform(
  rawUrl: string
): SupportedEcommercePlatform | null {
  if (typeof rawUrl !== 'string') return null;
  const cleaned = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return null;

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    (parsed.port !== '' && parsed.port !== '443')
  ) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..')
  ) {
    return null;
  }

  let matchedPlatform: SupportedEcommercePlatform | null = null;
  for (const platform of Object.keys(
    ALLOWED_CHECKOUT_STORE_HOSTS
  ) as SupportedEcommercePlatform[]) {
    if (matchesAllowedStoreHost(platform, host)) {
      matchedPlatform = platform;
      break;
    }
  }
  if (!matchedPlatform) return null;

  const canonicalUrl = `${parsed.origin}${parsed.pathname}`;
  const rawSegments = parsed.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  if (
    rawSegments.length > 0 &&
    STATIC_ASSET_EXT_REGEX.test(rawSegments[rawSegments.length - 1]!)
  ) {
    return null;
  }

  const normalizedSegments = rawSegments.map((seg) =>
    foldCheckoutAscii(seg.replace(/\.(?:html?|aspx|php)$/i, ''))
  );
  for (const seg of normalizedSegments) {
    if (NON_CHECKOUT_SEGMENTS.has(seg)) {
      return null;
    }
  }

  // Never classify a valid marketplace PDP URL as a cart/checkout route.
  if (
    MULTI_SELLER_MARKETPLACES.has(matchedPlatform) &&
    extractIdsFromUrl(matchedPlatform, canonicalUrl).externalItemId
  ) {
    return null;
  }

  if (
    matchedPlatform === 'lazada' &&
    (host === 'cart.lazada.vn' || host === 'checkout.lazada.vn')
  ) {
    return matchedPlatform;
  }

  if (normalizedSegments.length === 0 || normalizedSegments.length > 2) {
    return null;
  }

  const first = normalizedSegments[0]!;
  if (normalizedSegments.length === 1) {
    return CHECKOUT_OR_CART_SEGMENTS.has(first) ? matchedPlatform : null;
  }

  const second = normalizedSegments[1]!;
  if (
    CHECKOUT_SUBPATH_PREFIXES.has(first) &&
    CHECKOUT_OR_CART_SEGMENTS.has(second)
  ) {
    return matchedPlatform;
  }
  if (
    CHECKOUT_OR_CART_SEGMENTS.has(first) &&
    CHECKOUT_STEP_SEGMENTS.has(second)
  ) {
    return matchedPlatform;
  }

  return null;
}

/**
 * Recognizes cart and checkout URLs across the 22 supported Vietnamese stores
 * where content scripts execute (`shop.tiktok.com` + the other 21 stores;
 * `www.tiktok.com` only injects on PDP paths per DOS/Rate#1601 and always
 * returns `false` here).
 */
export function isCheckoutOrCartUrl(rawUrl: string): boolean {
  return detectCheckoutPlatform(rawUrl) !== null;
}

const FORBIDDEN_CHECKOUT_TAGS = new Set([
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'OPTGROUP',
  'FORM',
  'BUTTON',
  'FIELDSET',
  'DATALIST',
  'OUTPUT',
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'CANVAS',
  'TEMPLATE',
  'HEADER',
  'FOOTER',
  'NAV',
  'ASIDE',
  'DIALOG',
]);

const STRIKETHROUGH_PRICE_TAGS = new Set(['DEL', 'S', 'STRIKE']);

const FORBIDDEN_ARIA_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'form',
  'dialog',
  'alertdialog',
]);

const FORBIDDEN_ATTR_TOKENS = new Set([
  'address',
  'addresses',
  'recipient',
  'consignee',
  'receiver',
  'customer',
  'buyer',
  'fullname',
  'email',
  'mail',
  'phone',
  'telephone',
  'tel',
  'sdt',
  'sodienthoai',
  'diachi',
  'nguoinhan',
  'hoten',
  'cccd',
  'cmnd',
  'passport',
  'coupon',
  'coupons',
  'voucher',
  'vouchers',
  'promocode',
  'giftcard',
  'magiam',
  'magiamgia',
  'payment',
  'payments',
  'creditcard',
  'debitcard',
  'cardnumber',
  'cvv',
  'cvc',
  'iban',
  'swift',
  'momo',
  'zalopay',
  'vnpay',
  'vietqr',
  'applepay',
  'googlepay',
  'subtotal',
  'grandtotal',
  'upsell',
  'crosssell',
  'recommend',
  'recommended',
  'related',
]);

const FORBIDDEN_ATTR_SUBSTRINGS = [
  'dia-chi',
  'nguoi-nhan',
  'ho-ten',
  'so-dien-thoai',
  'khach-hang',
  'ma-giam',
  'promo-code',
  'discount-code',
  'gift-card',
  'pay-method',
  'payment-method',
  'credit-card',
  'debit-card',
  'card-number',
  'bank-transfer',
  'tra-gop',
  'hoa-don',
  'shipping-address',
  'delivery-address',
  'billing-address',
  'shipping-info',
  'delivery-info',
  'shipping-fee',
  'phi-van-chuyen',
  'order-summary',
  'cart-summary',
  'checkout-summary',
  'summary-total',
  'grand-total',
  'tam-tinh',
  'tong-cong',
  'tong-tien',
  'mua-kem',
  'goi-y',
  'cross-sell',
] as const;

const PRICE_EXCLUDE_TOKENS = new Set([
  'old',
  'original',
  'del',
  'deleted',
  'regular',
  'strike',
  'strikethrough',
  'before',
  'total',
  'subtotal',
  'summary',
  'shipping',
  'discount',
  'save',
  'saving',
]);

const FORBIDDEN_DESCENDANT_SELECTOR =
  'input, textarea, select, option, form, button, [contenteditable]:not([contenteditable="false"]), [autocomplete]';

const FORBIDDEN_CLOSEST_SELECTOR =
  'input, textarea, select, option, form, button, [hidden], [aria-hidden="true"], [contenteditable]:not([contenteditable="false"]), [autocomplete], header, footer, nav, aside';

type DomLikeElement = {
  nodeType?: number;
  tagName?: string;
  nodeName?: string;
  id?: string;
  className?: unknown;
  hidden?: boolean;
  isContentEditable?: boolean;
  textContent?: string | null;
  nodeValue?: string | null;
  parentElement?: DomLikeElement | null;
  childNodes?: ArrayLike<DomLikeElement>;
  children?: ArrayLike<DomLikeElement>;
  hasAttribute?: (name: string) => boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
  querySelector?: (selector: string) => DomLikeElement | null;
  querySelectorAll?: (selector: string) => ArrayLike<DomLikeElement>;
};

function getSafeAttr(el: DomLikeElement, name: string): string {
  if (typeof el.getAttribute === 'function') {
    const val = el.getAttribute(name);
    if (typeof val === 'string') return val.slice(0, 256);
  }
  if (name === 'id' && typeof el.id === 'string') {
    return el.id.slice(0, 256);
  }
  if (name === 'class' && typeof el.className === 'string') {
    return el.className.slice(0, 256);
  }
  return '';
}

function hasSafeAttr(el: DomLikeElement, name: string): boolean {
  if (typeof el.hasAttribute === 'function') {
    return el.hasAttribute(name);
  }
  if (typeof el.getAttribute === 'function') {
    return el.getAttribute(name) !== null;
  }
  return false;
}

function normalizeAttrForTokenScan(raw: string): string {
  if (!raw) return '';
  // Split camelCase only when left side has >= 2 lowercase letters so `iPhone`/`iPad` stay intact.
  const decamelized = raw.slice(0, 256).replace(/([a-z]{2,})([A-Z])/g, '$1-$2');
  return foldCheckoutAscii(decamelized).replace(/[^a-z0-9]+/g, '-');
}

function hasForbiddenPiiOrPaymentCue(rawAttrValue: string): boolean {
  if (!rawAttrValue) return false;
  const normalized = normalizeAttrForTokenScan(rawAttrValue);
  if (!normalized) return false;
  for (const sub of FORBIDDEN_ATTR_SUBSTRINGS) {
    if (normalized.includes(sub)) return true;
  }
  const tokens = normalized.split('-').filter(Boolean);
  for (const tok of tokens) {
    if (FORBIDDEN_ATTR_TOKENS.has(tok)) return true;
  }
  return false;
}

function resolveUpperTag(el: DomLikeElement): string {
  const raw =
    typeof el.tagName === 'string'
      ? el.tagName
      : typeof el.nodeName === 'string'
        ? el.nodeName
        : '';
  return raw.trim().toUpperCase();
}

export function isForbiddenCheckoutNode(
  node: unknown,
  options?: { skipPriceExcludeTokens?: boolean }
): boolean {
  if (!node || typeof node !== 'object') return true;
  const el = node as DomLikeElement;
  if (el.nodeType === 3) return false;

  const tag = resolveUpperTag(el);
  if (tag && FORBIDDEN_CHECKOUT_TAGS.has(tag)) return true;
  if (
    options?.skipPriceExcludeTokens &&
    tag &&
    STRIKETHROUGH_PRICE_TAGS.has(tag)
  ) {
    return true;
  }

  if (el.hidden === true || hasSafeAttr(el, 'hidden')) return true;
  if (getSafeAttr(el, 'aria-hidden').trim().toLowerCase() === 'true') {
    return true;
  }

  if (el.isContentEditable === true) return true;
  if (hasSafeAttr(el, 'contenteditable')) {
    const ce = getSafeAttr(el, 'contenteditable').trim().toLowerCase();
    if (ce !== 'false') return true;
  }

  if (hasSafeAttr(el, 'autocomplete')) return true;

  const role = getSafeAttr(el, 'role').trim().toLowerCase();
  if (role) {
    for (const token of role.split(/\s+/)) {
      if (FORBIDDEN_ARIA_ROLES.has(token)) return true;
    }
  }

  for (const attrName of [
    'id',
    'class',
    'name',
    'data-testid',
    'data-section',
    'aria-label',
  ]) {
    const val = getSafeAttr(el, attrName);
    if (hasForbiddenPiiOrPaymentCue(val)) return true;
    if (options?.skipPriceExcludeTokens && val) {
      const normalized = normalizeAttrForTokenScan(val);
      const tokens = normalized.split('-').filter(Boolean);
      if (tokens.some((tok) => PRICE_EXCLUDE_TOKENS.has(tok))) {
        return true;
      }
    }
  }

  return false;
}

function isForbiddenCheckoutSubtree(node: unknown): boolean {
  if (!node || typeof node !== 'object') return true;
  const el = node as DomLikeElement;
  if (isForbiddenCheckoutNode(el)) return true;
  if (typeof el.closest === 'function') {
    try {
      if (el.closest(FORBIDDEN_CLOSEST_SELECTOR)) return true;
    } catch {
      // Continue with explicit ancestor walk when mock closest does not parse full selector
    }
  }
  let ancestor = el.parentElement ?? null;
  let depth = 0;
  while (ancestor && depth < 24) {
    if (isForbiddenCheckoutNode(ancestor)) return true;
    ancestor = ancestor.parentElement ?? null;
    depth += 1;
  }
  return false;
}

function readSafeNodeText(
  root: DomLikeElement,
  options?: { skipPriceExcludeTokens?: boolean }
): string {
  if (isForbiddenCheckoutSubtree(root)) return '';
  if (
    options?.skipPriceExcludeTokens &&
    isForbiddenCheckoutNode(root, { skipPriceExcludeTokens: true })
  ) {
    return '';
  }

  let visited = 0;
  const maxVisited = 200;
  const chunks: string[] = [];

  const walk = (node: DomLikeElement, depth: number): void => {
    if (visited >= maxVisited || depth > 12) return;
    visited += 1;

    const isTextNode =
      node.nodeType === 3 ||
      (!node.tagName && !node.nodeName && typeof node.nodeValue === 'string');
    if (isTextNode) {
      const raw = node.nodeValue ?? node.textContent ?? '';
      if (typeof raw === 'string' && raw) chunks.push(raw);
      return;
    }

    if (isForbiddenCheckoutNode(node, options)) return;

    if (node.childNodes && node.childNodes.length > 0) {
      for (let i = 0; i < node.childNodes.length; i += 1) {
        const child = node.childNodes[i];
        if (child) walk(child, depth + 1);
      }
      return;
    }

    if (node.children && node.children.length > 0) {
      for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i];
        if (child) walk(child, depth + 1);
      }
      return;
    }

    // Leaf element (or lightweight test mock without childNodes): guard against
    // any hidden/form/input descendants before reading textContent.
    if (typeof node.querySelector === 'function') {
      try {
        if (node.querySelector(FORBIDDEN_DESCENDANT_SELECTOR)) return;
      } catch {
        // Ignore selector errors on minimal test mocks
      }
    }
    if (typeof node.textContent === 'string' && node.textContent) {
      chunks.push(node.textContent);
    }
  };

  walk(root, 0);
  return stripLoneSurrogates(chunks.join(' '))
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasLongDigitRun(text: string, minDigits = 13): boolean {
  let run = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      run += 1;
      if (run >= minDigits) return true;
    } else if (code !== 32 && code !== 45 && code !== 46) {
      run = 0;
    }
  }
  return false;
}

function looksLikePiiText(raw: string): boolean {
  const bounded = raw.slice(0, 500);
  // Email address check (bounded, linear scan around '@').
  const atIdx = bounded.indexOf('@');
  if (atIdx > 0 && atIdx < bounded.length - 3) {
    const left = bounded.slice(0, atIdx).split(/\s+/).pop() ?? '';
    const right = bounded.slice(atIdx + 1).split(/\s+/)[0] ?? '';
    if (
      left.length >= 1 &&
      left.length <= 64 &&
      /^[a-z0-9._+-]+$/i.test(left) &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(right)
    ) {
      return true;
    }
  }
  // Card/account digit run check (O(N), zero regex backtracking).
  if (hasLongDigitRun(bounded, 13)) return true;

  // Vietnamese mobile/landline phone pattern (`09xxxxxxxx`, `+84 9xx xxx xxx`).
  const compactPhoneScan = bounded.replace(/[\s.-]+/g, '');
  if (
    /(?:^|[^\p{L}\p{N}])(?:\+84|0[235789])\d{8,9}(?![\p{L}\p{N}])/u.test(
      compactPhoneScan
    )
  ) {
    return true;
  }
  return false;
}

const GENERIC_CART_LABELS = new Set([
  'cart',
  'shopping cart',
  'checkout',
  'gio hang',
  'thanh toan',
  'dat hang',
  'san pham',
  'don gia',
  'so luong',
  'thanh tien',
  'xoa',
  'remove',
  'delete',
]);

const CART_LINE_ITEM_SELECTORS = [
  '[data-rate-cart-item]',
  '[data-testid*="cart-item"]',
  '[data-testid*="checkout-item"]',
  '[data-sqe="item"]',
  '.cart-item',
  '.cart__item',
  '.cart-product-item',
  '.cart-item-row',
  '.checkout-item',
  '.checkout-product-item',
  '.order-item',
  '.basket-item',
  '.line-item',
  '.shop-cart-item',
  '.item-cart',
  '.product-cart-item',
  'tr.cart_item',
] as const;

const CART_ITEM_TITLE_SELECTORS = [
  '[data-rate-item-title]',
  '[data-testid*="item-name"]',
  '[data-testid*="product-name"]',
  '[data-testid*="item-title"]',
  '.cart-item-name',
  '.cart-item__name',
  '.cart-product-name',
  '.checkout-item-name',
  '.product-name',
  '.item-name',
  '.item-title',
  '.product-title',
  'h2',
  'h3',
  'h4',
] as const;

const CART_ITEM_PRICE_SELECTORS = [
  '[data-rate-unit-price]',
  '[data-testid*="unit-price"]',
  '[data-testid*="item-price"]',
  '[data-testid*="product-price"]',
  '.unit-price',
  '.cart-item-price',
  '.cart-item__price',
  '.checkout-item-price',
  '.item-price',
  '.product-price',
  '.current-price',
  '.sale-price',
  '.new-price',
  '.price',
] as const;

function querySafeSubElements(
  container: DomLikeElement,
  selector: string
): DomLikeElement[] {
  if (typeof container.querySelectorAll === 'function') {
    try {
      const list = container.querySelectorAll(selector);
      return list ? Array.from(list) : [];
    } catch {
      return [];
    }
  }
  if (typeof container.querySelector === 'function') {
    try {
      const single = container.querySelector(selector);
      return single ? [single] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function resolveCartItemProductLink(
  itemEl: DomLikeElement,
  pagePlatform: SupportedEcommercePlatform,
  pageOrigin: string
): { productUrl: string | null; anchorTitle: string } {
  const anchors = querySafeSubElements(itemEl, 'a[href]');
  let fallbackUrl: string | null = null;
  let fallbackTitle = '';

  for (const anchor of anchors.slice(0, 12)) {
    if (isForbiddenCheckoutSubtree(anchor)) continue;
    const rawHref = getSafeAttr(anchor, 'href').trim();
    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) {
      continue;
    }
    let resolvedHref: string;
    try {
      resolvedHref = new URL(rawHref, pageOrigin).href;
    } catch {
      continue;
    }
    const sanitized = sanitizeProductUrl(resolvedHref);
    if (!sanitized) continue;
    if (isCheckoutOrCartUrl(sanitized)) continue;

    let samePlatform = false;
    try {
      const host = new URL(sanitized).hostname.toLowerCase();
      samePlatform =
        matchesAllowedStoreHost(pagePlatform, host) ||
        (pagePlatform === 'tiktok' && host === 'www.tiktok.com');
    } catch {
      samePlatform = false;
    }
    if (!samePlatform) continue;

    const anchorText = cleanExtractedProductTitle(readSafeNodeText(anchor));
    const hasItemId = Boolean(
      extractIdsFromUrl(pagePlatform, sanitized).externalItemId
    );
    if (hasItemId) {
      return { productUrl: sanitized, anchorTitle: anchorText };
    }
    if (!fallbackUrl) {
      fallbackUrl = sanitized;
      fallbackTitle = anchorText;
    }
  }

  return { productUrl: fallbackUrl, anchorTitle: fallbackTitle };
}

function isAcceptableCartTitle(rawTitle: string): string | null {
  const cleaned = sliceCodePoints(cleanExtractedProductTitle(rawTitle), 300);
  if (!cleaned || cleaned.length < 4) return null;
  if (!/\p{L}/u.test(cleaned)) return null;
  if (looksLikePiiText(cleaned)) return null;
  const folded = foldCheckoutAscii(cleaned).replace(/\s+/g, ' ').trim();
  if (GENERIC_CART_LABELS.has(folded)) return null;
  return cleaned;
}

/**
 * Privacy-first read-only extraction of up to 5 distinct cart line items on
 * supported cart/checkout pages.
 *
 * Strictly skips `<input>`, `<textarea>`, `<select>`, `form`, `[contenteditable]`,
 * `[autocomplete]`, address, phone, email, coupon, and payment DOM subtrees,
 * never reads `.value`, and performs zero DOM mutations.
 */
export function extractCartLineItems(
  doc: Document,
  pageUrl: string
): ExtractedCartLineItem[] {
  if (!doc || typeof doc !== 'object') return [];
  const pagePlatform = detectCheckoutPlatform(pageUrl);
  if (!pagePlatform) return [];

  let pageOrigin: string;
  try {
    pageOrigin = new URL(pageUrl.trim()).origin;
  } catch {
    return [];
  }

  const docLike = doc as unknown as DomLikeElement;
  const candidateRows: DomLikeElement[] = [];
  const seenRowRefs = new Set<DomLikeElement>();

  for (const selector of CART_LINE_ITEM_SELECTORS) {
    const matched = querySafeSubElements(docLike, selector);
    for (const node of matched) {
      if (candidateRows.length >= 40) break;
      if (!node || seenRowRefs.has(node)) continue;
      seenRowRefs.add(node);
      candidateRows.push(node);
    }
    if (candidateRows.length >= 40) break;
  }

  if (candidateRows.length === 0) return [];

  // Prefer leaf cart rows when an outer wrapper and inner row both matched.
  const leafRows = candidateRows.filter((row) => {
    for (const other of candidateRows) {
      if (other === row) continue;
      let parent = other.parentElement ?? null;
      let depth = 0;
      while (parent && depth < 16) {
        if (parent === row) return false;
        parent = parent.parentElement ?? null;
        depth += 1;
      }
    }
    return true;
  });

  const items: ExtractedCartLineItem[] = [];
  const seenItemKeys = new Set<string>();

  for (const row of leafRows) {
    if (items.length >= MAX_CART_LINE_ITEMS) break;
    if (isForbiddenCheckoutSubtree(row)) continue;

    const { productUrl, anchorTitle } = resolveCartItemProductLink(
      row,
      pagePlatform,
      pageOrigin
    );

    let resolvedTitle: string | null = isAcceptableCartTitle(anchorTitle);
    if (!resolvedTitle) {
      for (const titleSel of CART_ITEM_TITLE_SELECTORS) {
        const titleNodes = querySafeSubElements(row, titleSel);
        for (const titleNode of titleNodes.slice(0, 6)) {
          const candidate = isAcceptableCartTitle(readSafeNodeText(titleNode));
          if (candidate) {
            resolvedTitle = candidate;
            break;
          }
        }
        if (resolvedTitle) break;
      }
    }
    if (!resolvedTitle) continue;

    let resolvedPrice: number | null = null;
    for (const priceSel of CART_ITEM_PRICE_SELECTORS) {
      const priceNodes = querySafeSubElements(row, priceSel);
      for (const priceNode of priceNodes.slice(0, 8)) {
        const priceText = readSafeNodeText(priceNode, {
          skipPriceExcludeTokens: true,
        });
        const parsed = parseVndPriceText(priceText);
        if (
          parsed &&
          parsed >= 10_000 &&
          parsed <= MAX_VALID_EXTENSION_VND_PRICE
        ) {
          resolvedPrice = parsed;
          break;
        }
      }
      if (resolvedPrice !== null) break;
    }
    if (resolvedPrice === null) continue;

    const dedupeKey = productUrl
      ? `url:${productUrl.toLowerCase()}`
      : `title:${foldCheckoutAscii(resolvedTitle).replace(/\s+/g, ' ')}`;
    if (seenItemKeys.has(dedupeKey)) continue;
    seenItemKeys.add(dedupeKey);

    items.push({
      title: resolvedTitle,
      productUrl,
      unitPriceVnd: resolvedPrice,
    });
  }

  return items;
}

export function sanitizeCartLineItems(
  rawItems: unknown,
  pageUrl: string
): ExtractedCartLineItem[] {
  const pagePlatform = detectCheckoutPlatform(pageUrl);
  if (!pagePlatform || !Array.isArray(rawItems)) return [];

  const sanitized: ExtractedCartLineItem[] = [];
  const seenKeys = new Set<string>();

  for (const raw of rawItems) {
    if (sanitized.length >= MAX_CART_LINE_ITEMS) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as {
      title?: unknown;
      productUrl?: unknown;
      unitPriceVnd?: unknown;
    };
    if (typeof candidate.title !== 'string') continue;
    const cleanTitle = isAcceptableCartTitle(candidate.title);
    if (!cleanTitle) continue;

    const rawPrice = candidate.unitPriceVnd;
    if (
      typeof rawPrice !== 'number' ||
      !Number.isFinite(rawPrice) ||
      Math.round(rawPrice) < 10_000 ||
      Math.round(rawPrice) > MAX_VALID_EXTENSION_VND_PRICE
    ) {
      continue;
    }
    const unitPriceVnd = Math.round(rawPrice);

    let productUrl: string | null = null;
    if (
      typeof candidate.productUrl === 'string' &&
      candidate.productUrl.trim()
    ) {
      const cleanedUrl = sanitizeProductUrl(candidate.productUrl);
      if (cleanedUrl && !isCheckoutOrCartUrl(cleanedUrl)) {
        try {
          const parsed = new URL(cleanedUrl);
          const host = parsed.hostname.toLowerCase();
          if (
            parsed.protocol === 'https:' &&
            (matchesAllowedStoreHost(pagePlatform, host) ||
              (pagePlatform === 'tiktok' && host === 'www.tiktok.com'))
          ) {
            productUrl = cleanedUrl;
          }
        } catch {
          productUrl = null;
        }
      }
    }

    const dedupeKey = productUrl
      ? `url:${productUrl.toLowerCase()}`
      : `title:${foldCheckoutAscii(cleanTitle).replace(/\s+/g, ' ')}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    sanitized.push({
      title: cleanTitle,
      productUrl,
      unitPriceVnd,
    });
  }

  return sanitized;
}

export function buildCartItemsSignature(
  pageUrl: string,
  items: readonly ExtractedCartLineItem[]
): string {
  const cleanPage = sanitizeProductUrl(pageUrl) ?? '';
  return JSON.stringify([
    cleanPage,
    items
      .slice(0, MAX_CART_LINE_ITEMS)
      .map((item) => [item.productUrl ?? '', item.title, item.unitPriceVnd]),
  ]);
}

/**
 * Strict URL guard for checkout warning comparison links rendered inside the
 * host store's Shadow DOM: permits ONLY `https://rate.vn` and `https://www.rate.vn`
 * (or the configured localhost dev origin when `allowConfiguredApiBase` is true).
 */
export function sanitizeRateComparisonUrl(
  rawUrl: unknown,
  options?: { apiBaseUrl?: string; strictProdHttpsOnly?: boolean }
): string {
  const fallback = 'https://rate.vn';
  const configuredBase = options?.strictProdHttpsOnly
    ? fallback
    : normalizeAllowedApiBaseUrl(options?.apiBaseUrl ?? DEFAULT_API_BASE_URL);

  if (typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (
    !trimmed ||
    trimmed.length > 2048 ||
    /\s/.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\')
  ) {
    return fallback;
  }

  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, configuredBase)
      : new URL(trimmed);
    if (parsed.username || parsed.password) return fallback;
    const host = parsed.hostname.toLowerCase();
    const isRateProdHttps =
      parsed.protocol === 'https:' &&
      parsed.port === '' &&
      (host === 'rate.vn' || host === 'www.rate.vn');
    if (isRateProdHttps) {
      return parsed.href;
    }
    if (
      !options?.strictProdHttpsOnly &&
      parsed.origin.toLowerCase() === configuredBase.toLowerCase()
    ) {
      return parsed.href;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

const ALLOWED_COMPARISON_CATEGORIES = new Set([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

function resolveComparisonPageUrl(lookup: ExtensionLookupData): string {
  const rawCategory =
    typeof lookup.categorySlug === 'string'
      ? stripLoneSurrogates(lookup.categorySlug).trim()
      : '';
  const category = ALLOWED_COMPARISON_CATEGORIES.has(rawCategory)
    ? rawCategory
    : 'smartphones';
  const slug =
    typeof lookup.masterProduct?.slug === 'string'
      ? stripLoneSurrogates(lookup.masterProduct.slug)
          .replace(/\p{Cc}+/gu, '')
          .trim()
      : '';
  const candidatePath =
    lookup.productDetailUrl ||
    (slug ? `/${category}/${encodeURIComponent(slug)}` : null) ||
    lookup.compareUrl ||
    '/';
  return sanitizeRateComparisonUrl(candidatePath, {
    strictProdHttpsOnly: true,
  });
}

function collectVerifiedOfficialOffers(
  lookup: ExtensionLookupData
): ExtensionOfferItem[] {
  const seen = new Set<string>();
  const combined = [
    ...(Array.isArray(lookup.allOffers) ? lookup.allOffers : []),
    ...(Array.isArray(lookup.topCheaperOffers) ? lookup.topCheaperOffers : []),
  ];
  const out: ExtensionOfferItem[] = [];
  for (const off of combined) {
    if (!off || typeof off !== 'object') continue;
    if (off.availability !== 'in_stock') continue;
    if (off.implausiblyLow) continue;
    if (off.merchant?.is_official !== true) continue;
    if (
      typeof off.price_current !== 'number' ||
      !Number.isFinite(off.price_current) ||
      Math.round(off.price_current) < 10_000 ||
      Math.round(off.price_current) > MAX_VALID_EXTENSION_VND_PRICE
    ) {
      continue;
    }
    const idKey =
      typeof off.id === 'string' && off.id.trim()
        ? off.id.trim()
        : `${off.platform}:${off.url}:${Math.round(off.price_current)}`;
    if (seen.has(idKey)) continue;
    seen.add(idKey);
    out.push(off);
  }
  return out.sort((a, b) => a.price_current - b.price_current);
}

/**
 * Evaluates a single cart item against a read-only `rate.vn` lookup response.
 * Emits a warning ONLY when:
 * 1. A verified `in_stock` official offer on `rate.vn` is cheaper by
 *    `>= 5%` AND `>= 200,000 VND`, OR
 * 2. The cart unit price exceeds the verified `rate.vn` reference/median price
 *    by `>= 15%`.
 */
export function evaluateCheckoutItemTrap(
  item: ExtractedCartLineItem,
  lookup: ExtensionLookupData | null | undefined,
  options?: {
    currentPlatform?: SupportedEcommercePlatform | null;
    apiBaseUrl?: string;
  }
): CheckoutPriceTrapWarning | null {
  if (!item || !lookup || typeof lookup !== 'object') return null;
  if (lookup.isAccessoryOrPart) return null;
  if (
    lookup.matchStatus !== 'exact_listing' &&
    lookup.matchStatus !== 'canonical_model'
  ) {
    return null;
  }
  if (lookup.priceAssessment?.verdict === 'accessory_skip') return null;

  const cartPrice = Math.round(item.unitPriceVnd);
  if (
    !Number.isFinite(cartPrice) ||
    cartPrice < 10_000 ||
    cartPrice > MAX_VALID_EXTENSION_VND_PRICE
  ) {
    return null;
  }

  const comparisonUrl = resolveComparisonPageUrl(lookup);
  const currentPlatform = options?.currentPlatform ?? null;
  const itemCleanUrl = item.productUrl
    ? (sanitizeProductUrl(item.productUrl)?.toLowerCase() ?? null)
    : null;

  const officialOffers = collectVerifiedOfficialOffers(lookup);
  const cheaperOfficial = officialOffers.find((off) => {
    const offPlatform = String(off.platform ?? '')
      .trim()
      .toLowerCase();
    if (
      currentPlatform &&
      !MULTI_SELLER_MARKETPLACES.has(currentPlatform) &&
      offPlatform === currentPlatform
    ) {
      return false;
    }
    if (itemCleanUrl && typeof off.url === 'string') {
      const offCleanUrl = sanitizeProductUrl(off.url)?.toLowerCase() ?? null;
      if (offCleanUrl && offCleanUrl === itemCleanUrl) {
        return false;
      }
    }
    const offerPrice = Math.round(off.price_current);
    const savingsVnd = cartPrice - offerPrice;
    return (
      savingsVnd >= CHECKOUT_MIN_SAVINGS_VND &&
      savingsVnd * 100 >= cartPrice * CHECKOUT_MIN_SAVINGS_PCT
    );
  });

  const displayTitle =
    sliceCodePoints(
      stripLoneSurrogates(lookup.masterProduct?.name || item.title).trim(),
      200
    ) || item.title;

  if (cheaperOfficial) {
    const offerPrice = Math.round(cheaperOfficial.price_current);
    const savingsVnd = cartPrice - offerPrice;
    const savingsPct = roundHalfUpDecimal((savingsVnd / cartPrice) * 100, 1);
    const merchantName = sliceCodePoints(
      stripLoneSurrogates(String(cheaperOfficial.merchant?.name ?? '')).trim(),
      120
    );
    const platformLabel = sliceCodePoints(
      stripLoneSurrogates(String(cheaperOfficial.platform ?? ''))
        .trim()
        .toUpperCase(),
      40
    );
    return {
      reason: 'cheaper_official',
      itemTitle: displayTitle,
      cartUnitPriceVnd: cartPrice,
      referencePriceVnd: offerPrice,
      savingsVnd,
      savingsPct,
      markupPct: 0,
      cheaperMerchantName: merchantName || platformLabel || 'Rate.vn',
      cheaperPlatform: platformLabel || null,
      comparisonUrl,
    };
  }

  const rawMedian = lookup.priceAssessment?.marketMedianPrice;
  if (
    typeof rawMedian === 'number' &&
    Number.isFinite(rawMedian) &&
    Math.round(rawMedian) >= 10_000 &&
    Math.round(rawMedian) <= MAX_VALID_EXTENSION_VND_PRICE
  ) {
    const medianPrice = Math.round(rawMedian);
    const excessVnd = cartPrice - medianPrice;
    if (
      excessVnd > 0 &&
      excessVnd * 100 >= medianPrice * CHECKOUT_MIN_MARKUP_PCT
    ) {
      const markupPct = roundHalfUpDecimal((excessVnd / medianPrice) * 100, 1);
      return {
        reason: 'markup_trap',
        itemTitle: displayTitle,
        cartUnitPriceVnd: cartPrice,
        referencePriceVnd: medianPrice,
        savingsVnd: excessVnd,
        savingsPct: 0,
        markupPct,
        cheaperMerchantName: null,
        cheaperPlatform: null,
        comparisonUrl,
      };
    }
  }

  return null;
}

export function buildCartItemLookupSignal(
  platform: SupportedEcommercePlatform,
  item: ExtractedCartLineItem
): ExtractedPageProductSignal {
  const canonicalUrl = item.productUrl
    ? (sanitizeProductUrl(item.productUrl) ?? '')
    : '';
  const ids = canonicalUrl
    ? extractIdsFromUrl(platform, canonicalUrl)
    : { externalItemId: null, externalShopId: null };
  return {
    platform,
    canonicalUrl,
    externalItemId: ids.externalItemId,
    externalShopId: ids.externalShopId,
    title: item.title,
    selectedVariant: null,
    price: item.unitPriceVnd,
    originalPrice: null,
    ratingStar: null,
    ratingCount: null,
  };
}

export function buildCartLookupCacheKey(
  apiBaseUrl: string,
  platform: SupportedEcommercePlatform,
  item: ExtractedCartLineItem
): string {
  const safeBase = normalizeAllowedApiBaseUrl(apiBaseUrl).toLowerCase();
  const canonicalUrl = item.productUrl
    ? (sanitizeProductUrl(item.productUrl)?.toLowerCase() ?? '')
    : '';
  const ids = canonicalUrl
    ? extractIdsFromUrl(platform, canonicalUrl)
    : { externalItemId: null, externalShopId: null };
  const normalizedTitle = foldCheckoutAscii(item.title)
    .replace(/\s+/g, ' ')
    .trim();
  return JSON.stringify([
    safeBase,
    platform,
    ids.externalItemId ?? '',
    canonicalUrl,
    normalizedTitle,
  ]);
}

export interface CheckoutLookupCoordinatorOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxConcurrency?: number;
  now?: () => number;
}

/**
 * In-memory TTL cache + bounded concurrency semaphore (`<= 3` parallel lookups)
 * for cart/checkout read-only lookups in the MV3 service worker.
 */
export class CheckoutLookupCoordinator {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxConcurrency: number;
  private readonly now: () => number;
  private readonly cache = new Map<
    string,
    { expiresAt: number; data: ExtensionLookupData | null }
  >();
  private readonly inFlight = new Map<
    string,
    Promise<{ ok: boolean; data: ExtensionLookupData | null }>
  >();
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(options: CheckoutLookupCoordinatorOptions = {}) {
    this.ttlMs = Math.max(
      1_000,
      options.ttlMs ?? DEFAULT_CHECKOUT_CACHE_TTL_MS
    );
    this.maxEntries = Math.max(10, options.maxEntries ?? 100);
    this.maxConcurrency = Math.max(
      1,
      Math.min(5, options.maxConcurrency ?? DEFAULT_CHECKOUT_MAX_CONCURRENCY)
    );
    this.now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private setCache(key: string, data: ExtensionLookupData | null): void {
    const nowMs = this.now();
    for (const [k, entry] of this.cache) {
      if (entry.expiresAt <= nowMs) {
        this.cache.delete(k);
      }
    }
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      expiresAt: nowMs + this.ttlMs,
      data,
    });
  }

  async lookupItem(
    key: string,
    fetcher: () => Promise<{ ok: boolean; data: ExtensionLookupData | null }>
  ): Promise<{
    ok: boolean;
    data: ExtensionLookupData | null;
    cached: boolean;
  }> {
    const nowMs = this.now();
    const hit = this.cache.get(key);
    if (hit) {
      if (hit.expiresAt > nowMs) {
        return { ok: true, data: hit.data, cached: true };
      }
      this.cache.delete(key);
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      const res = await pending;
      return { ...res, cached: true };
    }

    const runPromise = (async () => {
      await this.acquireSlot();
      try {
        const outcome = await fetcher();
        if (outcome.ok) {
          this.setCache(key, outcome.data);
        }
        return outcome;
      } finally {
        this.releaseSlot();
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, runPromise);
    const res = await runPromise;
    return { ...res, cached: false };
  }
}
