/**
 * Localized Price-Alert Email Renderer, Resend HTTP Sender & Audience Suppression (DOS/Rate#1874)
 *
 * Delivers dark-mode-friendly HTML + plain-text alert emails in `vi`, `en`, and `cs`
 * (falling back to `vi`) with RFC 8058 one-click `List-Unsubscribe` headers, strict HTML
 * escaping, CR/LF header stripping, UTF-16 surrogate sanitization (#1853), and `https://` URLs.
 */
import { isIP } from 'node:net';
import { MAX_VALID_VND_PRICE } from '@repo/shared-data';
import { normalizeAlertSubscriberEmail } from './alert-unsubscribe-token.js';

export type AlertLocale = 'vi' | 'en' | 'cs';

export const DEFAULT_RATE_SITE_ORIGIN = 'https://rate.vn';
export const RESEND_API_BASE_URL = 'https://api.resend.com';
export const DEFAULT_RESEND_TIMEOUT_MS = 10_000;
export const MAX_RESEND_SUPPRESSION_PAGES = 1000;

const UNSUBSCRIBE_TOKEN_WIRE_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const HOST_LABEL_RE = /^[a-z0-9-]+$/;
const TLD_ALPHA_RE = /^[a-z]{2,63}$/;
const TLD_PUNYCODE_RE = /^xn--[a-z0-9-]{2,59}$/;
const RFC5322_DISPLAY_FORBIDDEN_RE = /[,;:@\\()[\]<>"]/;
const RESEND_AUDIENCE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface RenderPriceAlertEmailInput {
  readonly locale?: string | null;
  readonly productName: string;
  readonly targetPrice: number;
  readonly bestPrice: number;
  readonly merchantName: string;
  readonly productUrl: string;
  readonly unsubscribeToken: string;
  readonly siteOrigin?: string;
  readonly isAllTimeLow90d?: boolean;
}

export interface RenderedPriceAlertEmail {
  readonly locale: AlertLocale;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly unsubscribeUrl: string;
  readonly headers: {
    readonly 'List-Unsubscribe': string;
    readonly 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click';
  };
}

export interface SendPriceAlertEmailInput extends RenderPriceAlertEmailInput {
  readonly toEmail: string;
  readonly fromEmail: string;
  readonly resendApiKey: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface SendPriceAlertEmailResult {
  readonly id: string | null;
  readonly status: number;
}

export interface FetchResendUnsubscribedOptions {
  readonly resendApiKey: string;
  readonly audienceId: string;
  readonly timeoutMs?: number;
  readonly maxPages?: number;
  readonly fetchImpl?: typeof fetch;
}

function toWellFormedUtf16(value: string): string {
  const maybe = value as string & { toWellFormed?: () => string };
  if (typeof maybe.toWellFormed === 'function') {
    return maybe.toWellFormed();
  }
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value.slice(i, i + 2);
        i += 1;
      } else {
        out += '\uFFFD';
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += '\uFFFD';
    } else {
      out += value[i]!;
    }
  }
  return out;
}

/**
 * Slices a UTF-16 string to at most `maxUnits` code units without splitting an astral
 * surrogate pair (#1853), bounding the raw input BEFORE UTF-16 normalization.
 */
export function sanitizeUtf16WellFormed(raw: unknown, maxUnits = 500): string {
  if (typeof raw !== 'string' || !raw) return '';
  const safeMax =
    typeof maxUnits === 'number' && Number.isFinite(maxUnits) && maxUnits >= 1
      ? Math.min(Math.trunc(maxUnits), 16_384)
      : 500;
  let preEnd = Math.min(raw.length, safeMax);
  if (raw.length > safeMax && preEnd > 0) {
    const prev = raw.charCodeAt(preEnd - 1);
    const next = raw.charCodeAt(preEnd);
    if (prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      preEnd -= 1;
    }
  }
  return toWellFormedUtf16(preEnd < raw.length ? raw.slice(0, preEnd) : raw);
}

/**
 * Strips CR, LF, Unicode line/paragraph separators, format controls, and C0/C1 control
 * characters from single-line strings (email subjects, headers, display names).
 */
export function stripHeaderCrLf(raw: unknown, maxUnits = 512): string {
  if (typeof raw !== 'string' || !raw) return '';
  const safeMax =
    typeof maxUnits === 'number' && Number.isFinite(maxUnits) && maxUnits >= 1
      ? Math.min(Math.trunc(maxUnits), 8192)
      : 512;
  const bounded = sanitizeUtf16WellFormed(raw, Math.min(safeMax * 2, 16_384));
  const cleaned = bounded
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitizeUtf16WellFormed(cleaned, safeMax).trimEnd();
}

/**
 * Escapes `&`, `<`, `>`, `"`, and `'` for safe HTML interpolation in elements and attributes,
 * after sanitizing lone UTF-16 surrogates and stripping C0/C1 control characters.
 */
export function escapeHtml(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  const wellFormed = toWellFormedUtf16(raw.length > 32_768 ? raw.slice(0, 32_768) : raw).replace(
    /(?:(?![\t\n])\p{Cc})/gu,
    ''
  );
  return wellFormed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeAlertLocale(raw: unknown): AlertLocale {
  if (typeof raw !== 'string') return 'vi';
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'en' || cleaned === 'cs') return cleaned;
  return 'vi';
}

function stripTrailingSlashesLinear(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}

function isDisallowedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    !host ||
    host.length > 253 ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..') ||
    host.startsWith('[') ||
    host.endsWith(']')
  ) {
    return true;
  }
  const bareIpv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(bareIpv6) !== 0) {
    return true;
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    host.endsWith('.nip.io') ||
    host.endsWith('.sslip.io') ||
    host.endsWith('.xip.io')
  ) {
    return true;
  }
  const labels = host.split('.');
  if (labels.length < 2) {
    return true;
  }
  for (const label of labels) {
    if (
      !label ||
      label.length > 63 ||
      !HOST_LABEL_RE.test(label) ||
      label.startsWith('-') ||
      label.endsWith('-')
    ) {
      return true;
    }
  }
  const tld = labels[labels.length - 1]!;
  if (!TLD_ALPHA_RE.test(tld) && !TLD_PUNYCODE_RE.test(tld)) {
    return true;
  }
  return false;
}

/**
 * Enforces a strict `https://` public origin (no path, query, fragment, or credentials).
 */
export function validateHttpsSiteOrigin(rawOrigin: unknown = DEFAULT_RATE_SITE_ORIGIN): string {
  if (typeof rawOrigin !== 'string' || rawOrigin.length > 512) {
    throw new Error('siteOrigin must be an https:// URL origin.');
  }
  const wellFormed = toWellFormedUtf16(rawOrigin);
  if (wellFormed !== rawOrigin) {
    throw new Error('siteOrigin contains invalid UTF-16 surrogates.');
  }
  const trimmed = stripTrailingSlashesLinear(wellFormed.trim());
  if (!trimmed || /[\s\p{Cc}\p{Cf}<>"'\\]/u.test(trimmed)) {
    throw new Error('siteOrigin is missing or contains disallowed characters.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('siteOrigin must be a valid https:// URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('siteOrigin must use https://.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('siteOrigin must not contain credentials.');
  }
  if (parsed.port !== '' && parsed.port !== '443') {
    throw new Error('siteOrigin must not specify a non-443 port.');
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('siteOrigin must not contain a path, query string, or fragment.');
  }
  if (isDisallowedHostname(parsed.hostname)) {
    throw new Error('siteOrigin must use a valid public domain name.');
  }
  return parsed.origin;
}

/**
 * Enforces a strict `https://` public URL without credentials or control characters.
 */
export function validateHttpsUrl(rawUrl: unknown, label = 'URL'): string {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    throw new Error(`${label} must be an https:// URL.`);
  }
  const wellFormed = toWellFormedUtf16(rawUrl);
  if (wellFormed !== rawUrl) {
    throw new Error(`${label} contains invalid UTF-16 surrogates.`);
  }
  const trimmed = wellFormed.trim();
  if (!trimmed || /[\s\p{Cc}\p{Cf}<>"'\\]/u.test(trimmed)) {
    throw new Error(`${label} is missing or contains disallowed characters.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid https:// URL.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use https://.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain embedded credentials.`);
  }
  if (parsed.port !== '' && parsed.port !== '443') {
    throw new Error(`${label} must not specify a non-443 port.`);
  }
  if (isDisallowedHostname(parsed.hostname)) {
    throw new Error(`${label} must use a valid public domain name.`);
  }
  return parsed.toString();
}

/**
 * Validates `ALERT_EMAIL_FROM` (`alerts@rate.vn` or `Rate.vn <alerts@rate.vn>`),
 * rejecting CR/LF, format controls, multi-mailbox smuggling, and RFC 5322 phrase specials.
 */
export function validateSenderFromAddress(rawFrom: unknown): string {
  if (typeof rawFrom !== 'string' || rawFrom.length > 320) {
    throw new Error('ALERT_EMAIL_FROM is required.');
  }
  const wellFormed = toWellFormedUtf16(rawFrom);
  if (wellFormed !== rawFrom || /[\r\n\u2028\u2029\p{Cc}\p{Cf}]/u.test(wellFormed)) {
    throw new Error('ALERT_EMAIL_FROM contains invalid control characters or surrogates.');
  }
  const trimmed = wellFormed.trim();
  if (!trimmed) {
    throw new Error('ALERT_EMAIL_FROM must be a non-empty sender address.');
  }

  const openAngle = trimmed.indexOf('<');
  if (openAngle === -1) {
    if (trimmed.includes('>')) {
      throw new Error('ALERT_EMAIL_FROM has unmatched angle brackets.');
    }
    const bare = normalizeAlertSubscriberEmail(trimmed);
    if (!bare) {
      throw new Error('ALERT_EMAIL_FROM is not a valid email address.');
    }
    return bare;
  }

  if (!trimmed.endsWith('>') || openAngle !== trimmed.lastIndexOf('<')) {
    throw new Error('ALERT_EMAIL_FROM must match "Display Name <email@domain>".');
  }
  let displayPart = trimmed.slice(0, openAngle).trim();
  if (displayPart.startsWith('"') || displayPart.endsWith('"')) {
    if (displayPart.length < 2 || !displayPart.startsWith('"') || !displayPart.endsWith('"')) {
      throw new Error('ALERT_EMAIL_FROM has unmatched double quotes in display name.');
    }
    displayPart = displayPart.slice(1, -1).trim();
  }
  if (displayPart.length > 120 || RFC5322_DISPLAY_FORBIDDEN_RE.test(displayPart)) {
    throw new Error(
      'ALERT_EMAIL_FROM display name contains disallowed RFC 5322 special characters.'
    );
  }
  const cleanDisplay = stripHeaderCrLf(displayPart, 120);
  const angleEmail = normalizeAlertSubscriberEmail(trimmed.slice(openAngle + 1, -1));
  if (!angleEmail) {
    throw new Error('ALERT_EMAIL_FROM angle address is not a valid email.');
  }
  return cleanDisplay ? `${cleanDisplay} <${angleEmail}>` : angleEmail;
}

export function validateResendApiKey(rawKey: unknown): string {
  if (typeof rawKey !== 'string' || rawKey.length > 512) {
    throw new Error('RESEND_API_KEY is required.');
  }
  const wellFormed = toWellFormedUtf16(rawKey);
  if (wellFormed !== rawKey) {
    throw new Error('RESEND_API_KEY contains invalid UTF-16 surrogates.');
  }
  const trimmed = wellFormed.trim();
  if (!trimmed || /[\s\p{Cc}\p{Cf}]/u.test(trimmed)) {
    throw new Error('RESEND_API_KEY is missing or malformed.');
  }
  return trimmed;
}

/**
 * Validates `RESEND_AUDIENCE_ID` against strict alphanumeric/UUID/slug format (`1..128` chars),
 * matching `apps/web` (`#1875`).
 */
export function validateResendAudienceId(rawAudienceId: unknown): string {
  if (typeof rawAudienceId !== 'string' || rawAudienceId.length > 256) {
    throw new Error('RESEND_AUDIENCE_ID must be a non-empty identifier.');
  }
  const wellFormed = toWellFormedUtf16(rawAudienceId);
  if (wellFormed !== rawAudienceId) {
    throw new Error('RESEND_AUDIENCE_ID contains invalid UTF-16 surrogates.');
  }
  const trimmed = wellFormed.trim();
  if (!RESEND_AUDIENCE_ID_RE.test(trimmed)) {
    throw new Error('RESEND_AUDIENCE_ID is invalid.');
  }
  return trimmed;
}

function validatePositiveVndAmount(raw: unknown, fieldName: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw > MAX_VALID_VND_PRICE) {
    throw new Error(`${fieldName} must be a finite positive VND amount.`);
  }
  const rounded = Math.round(raw);
  if (rounded < 1 || rounded > MAX_VALID_VND_PRICE) {
    throw new Error(`${fieldName} must be at least 1 VND.`);
  }
  return rounded;
}

/**
 * Formats integer VND deterministically across locales without ICU non-breaking space drift.
 */
export function formatAlertVndPrice(amountVnd: number, locale: AlertLocale): string {
  const rounded = Math.max(0, Math.round(Number.isFinite(amountVnd) ? amountVnd : 0));
  const digits = String(rounded);
  const sep = locale === 'en' ? ',' : locale === 'cs' ? ' ' : '.';
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return locale === 'vi' ? `${grouped} ₫` : `${grouped} VND`;
}

interface LocalizedCopy {
  readonly subject: (product: string, bestPrice: string, isAtl: boolean) => string;
  readonly badgeBrand: string;
  readonly badgeAtl: string;
  readonly heading: string;
  readonly intro: (product: string) => string;
  readonly labelBestPrice: string;
  readonly labelTargetPrice: string;
  readonly labelSavings: string;
  readonly savingsExactTarget: string;
  readonly labelMerchant: string;
  readonly ctaLabel: string;
  readonly footerReason: string;
  readonly unsubLabel: string;
}

const COPY_BY_LOCALE: Record<AlertLocale, LocalizedCopy> = {
  vi: {
    subject: (product, bestPrice, isAtl) =>
      isAtl
        ? `[Rate.vn] Đáy giá 90 ngày: ${product} còn ${bestPrice}`
        : `[Rate.vn] Chạm giá mục tiêu: ${product} còn ${bestPrice}`,
    badgeBrand: 'CẢNH BÁO GIÁ RATE.VN',
    badgeAtl: 'Đáy giá 90 ngày đã kiểm chứng (ATL)',
    heading: 'Sản phẩm bạn theo dõi đã chạm mức giá mục tiêu',
    intro: product =>
      `Hệ thống kiểm chứng giá của Rate.vn vừa ghi nhận mức giá còn hàng hợp lệ đạt mục tiêu bạn đặt cho ${product}.`,
    labelBestPrice: 'Giá tốt nhất đang còn hàng',
    labelTargetPrice: 'Giá mục tiêu của bạn',
    labelSavings: 'Tiết kiệm so với mục tiêu',
    savingsExactTarget: '0 ₫ (Chạm đúng mức giá mục tiêu)',
    labelMerchant: 'Nhà bán đã kiểm chứng',
    ctaLabel: 'Xem chi tiết trên Rate.vn',
    footerReason:
      'Bạn nhận được email này vì đã bật cảnh báo giá bằng tài khoản xác minh trên Rate.vn.',
    unsubLabel: 'Hủy cảnh báo giá 1 chạm',
  },
  en: {
    subject: (product, bestPrice, isAtl) =>
      isAtl
        ? `[Rate.vn] 90-day low reached: ${product} is now ${bestPrice}`
        : `[Rate.vn] Price alert reached: ${product} is now ${bestPrice}`,
    badgeBrand: 'RATE.VN PRICE ALERT',
    badgeAtl: 'Verified 90-Day Price Floor (ATL)',
    heading: 'Your tracked product hit your target price',
    intro: product =>
      `Rate.vn verified an in-stock, non-bait offer that meets your target price for ${product}.`,
    labelBestPrice: 'Verified in-stock best price',
    labelTargetPrice: 'Your target price',
    labelSavings: 'Savings below target',
    savingsExactTarget: '0 VND (At your target price)',
    labelMerchant: 'Verified merchant',
    ctaLabel: 'View verified offers on Rate.vn',
    footerReason:
      'You received this email because you subscribed to a verified price alert on Rate.vn.',
    unsubLabel: 'Unsubscribe from this alert',
  },
  cs: {
    subject: (product, bestPrice, isAtl) =>
      isAtl
        ? `[Rate.vn] 90denní minimum: ${product} za ${bestPrice}`
        : `[Rate.vn] Cílová cena dosažena: ${product} za ${bestPrice}`,
    badgeBrand: 'HLÍDÁNÍ CENY RATE.VN',
    badgeAtl: 'Ověřené 90denní cenové minimum (ATL)',
    heading: 'Sledovaný produkt dosáhl vaší cílové ceny',
    intro: product =>
      `Systém Rate.vn ověřil dostupnou nabídku skladem, která splňuje vaši cílovou cenu pro ${product}.`,
    labelBestPrice: 'Nejlepší ověřená cena skladem',
    labelTargetPrice: 'Vaše cílová cena',
    labelSavings: 'Úspora oproti cíli',
    savingsExactTarget: '0 VND (Přesně na cílové ceně)',
    labelMerchant: 'Ověřený prodejce',
    ctaLabel: 'Zobrazit ověřené nabídky na Rate.vn',
    footerReason:
      'Tento e-mail jste obdrželi, protože jste si na Rate.vn nastavili ověřené hlídání ceny.',
    unsubLabel: 'Zrušit hlídání ceny',
  },
};

function clampTimeoutMs(timeoutMs: unknown): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_RESEND_TIMEOUT_MS;
  }
  return Math.max(100, Math.min(DEFAULT_RESEND_TIMEOUT_MS, Math.trunc(timeoutMs)));
}

/**
 * Builds the localized HTML + plain-text alert email and RFC 8058 unsubscribe headers.
 */
export function renderPriceAlertEmail(input: RenderPriceAlertEmailInput): RenderedPriceAlertEmail {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Email render input must be an object.');
  }
  const locale = normalizeAlertLocale(input.locale);
  const copy = COPY_BY_LOCALE[locale];

  const siteOrigin =
    input.siteOrigin === undefined
      ? DEFAULT_RATE_SITE_ORIGIN
      : validateHttpsSiteOrigin(input.siteOrigin);
  const productUrl = validateHttpsUrl(input.productUrl, 'productUrl');

  const rawToken = typeof input.unsubscribeToken === 'string' ? input.unsubscribeToken.trim() : '';
  if (!rawToken || rawToken.length > 2048 || !UNSUBSCRIBE_TOKEN_WIRE_RE.test(rawToken)) {
    throw new Error('unsubscribeToken is missing or malformed.');
  }

  const unsubscribeUrl = validateHttpsUrl(
    `${siteOrigin}/api/v1/rate/watchlist/unsubscribe?token=${encodeURIComponent(rawToken)}`,
    'unsubscribeUrl'
  );

  const cleanProductName = stripHeaderCrLf(input.productName, 180) || 'Rate.vn Product';
  const cleanMerchantName = stripHeaderCrLf(input.merchantName, 140) || 'Verified Merchant';
  const bestPrice = validatePositiveVndAmount(input.bestPrice, 'bestPrice');
  const targetPrice = validatePositiveVndAmount(input.targetPrice, 'targetPrice');
  const savingsVnd = Math.max(0, targetPrice - bestPrice);
  const isAtl = input.isAllTimeLow90d === true;

  const bestPriceText = formatAlertVndPrice(bestPrice, locale);
  const targetPriceText = formatAlertVndPrice(targetPrice, locale);
  const savingsText =
    savingsVnd > 0 ? formatAlertVndPrice(savingsVnd, locale) : copy.savingsExactTarget;

  const subject = stripHeaderCrLf(copy.subject(cleanProductName, bestPriceText, isAtl), 200);

  const escapedProduct = escapeHtml(cleanProductName);
  const escapedMerchant = escapeHtml(cleanMerchantName);
  const escapedBestPrice = escapeHtml(bestPriceText);
  const escapedTargetPrice = escapeHtml(targetPriceText);
  const escapedSavings = escapeHtml(savingsText);
  const escapedHeading = escapeHtml(copy.heading);
  const escapedIntro = escapeHtml(copy.intro(cleanProductName));
  const escapedProductUrl = escapeHtml(productUrl);
  const escapedUnsubUrl = escapeHtml(unsubscribeUrl);

  const atlHtmlBlock = isAtl
    ? `<div style="display:inline-block;margin-left:8px;padding:4px 10px;border-radius:6px;background-color:#132a1c;border:1px solid #22c55e;color:#4ade80;font-size:12px;font-weight:700;">${escapeHtml(copy.badgeAtl)}</div>`
    : '';

  const html = [
    '<!DOCTYPE html>',
    `<html lang="${locale}" data-theme="dark">`,
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<meta name="color-scheme" content="dark light" />',
    '<meta name="supported-color-schemes" content="dark light" />',
    `<title>${escapeHtml(subject)}</title>`,
    '</head>',
    '<body style="margin:0;padding:24px 12px;background-color:#0f1113;color:#e8edf2;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;">',
    '<div style="max-width:560px;margin:0 auto;background-color:#161a1e;border:1px solid #2a313a;border-radius:12px;padding:24px;">',
    '<div style="margin-bottom:14px;">',
    `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background-color:#2b1416;border:1px solid #FF2E29;color:#ff7a76;font-size:12px;font-weight:700;letter-spacing:0.03em;">${escapeHtml(copy.badgeBrand)}</span>`,
    atlHtmlBlock,
    '</div>',
    `<h1 style="margin:0 0 10px;font-size:20px;line-height:1.35;color:#ffffff;">${escapedHeading}</h1>`,
    `<p style="margin:0 0 18px;font-size:14px;color:#c7d0d9;">${escapedIntro}</p>`,
    '<div style="background-color:#1d2228;border:1px solid #2a313a;border-radius:10px;padding:16px;margin-bottom:20px;">',
    `<div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:12px;">${escapedProduct}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">',
    `<tr><td style="padding:6px 0;color:#9ba5b0;">${escapeHtml(copy.labelBestPrice)}</td><td style="padding:6px 0;text-align:right;font-weight:800;font-size:17px;color:#4ade80;">${escapedBestPrice}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#9ba5b0;border-top:1px solid #2a313a;">${escapeHtml(copy.labelTargetPrice)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e8edf2;border-top:1px solid #2a313a;">${escapedTargetPrice}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#9ba5b0;border-top:1px solid #2a313a;">${escapeHtml(copy.labelSavings)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#fbbf24;border-top:1px solid #2a313a;">${escapedSavings}</td></tr>`,
    `<tr><td style="padding:6px 0;color:#9ba5b0;border-top:1px solid #2a313a;">${escapeHtml(copy.labelMerchant)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#e8edf2;border-top:1px solid #2a313a;">${escapedMerchant}</td></tr>`,
    '</table>',
    '</div>',
    '<div style="margin-bottom:22px;">',
    `<a href="${escapedProductUrl}" style="display:inline-block;padding:12px 20px;background-color:#FF2E29;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(copy.ctaLabel)}</a>`,
    '</div>',
    '<div style="border-top:1px solid #2a313a;padding-top:14px;font-size:12px;color:#9ba5b0;">',
    `<p style="margin:0 0 6px;">${escapeHtml(copy.footerReason)}</p>`,
    `<p style="margin:0;"><a href="${escapedUnsubUrl}" style="color:#ff7a76;text-decoration:underline;">${escapeHtml(copy.unsubLabel)}</a></p>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('\n');

  const textLines = [
    copy.badgeBrand,
    ...(isAtl ? [`[${copy.badgeAtl}]`] : []),
    '',
    copy.heading,
    copy.intro(cleanProductName),
    '',
    `${cleanProductName}`,
    `- ${copy.labelBestPrice}: ${bestPriceText}`,
    `- ${copy.labelTargetPrice}: ${targetPriceText}`,
    `- ${copy.labelSavings}: ${savingsText}`,
    `- ${copy.labelMerchant}: ${cleanMerchantName}`,
    '',
    `${copy.ctaLabel}: ${productUrl}`,
    '',
    copy.footerReason,
    `${copy.unsubLabel}: ${unsubscribeUrl}`,
  ];
  const text = textLines.join('\n');

  const listUnsubscribeHeader = stripHeaderCrLf(`<${unsubscribeUrl}>`, 2200);
  if (!listUnsubscribeHeader.startsWith('<https://') || !listUnsubscribeHeader.endsWith('>')) {
    throw new Error('Constructed List-Unsubscribe header failed validation.');
  }

  return {
    locale,
    subject,
    html,
    text,
    unsubscribeUrl,
    headers: {
      'List-Unsubscribe': listUnsubscribeHeader,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * Sends a localized price-alert email via Resend HTTP API (`POST https://api.resend.com/emails`)
 * with `AbortSignal.timeout(10_000)` and RFC 8058 one-click unsubscribe headers.
 */
export async function sendPriceAlertEmail(
  input: SendPriceAlertEmailInput
): Promise<SendPriceAlertEmailResult> {
  const apiKey = validateResendApiKey(input?.resendApiKey);
  const from = validateSenderFromAddress(input?.fromEmail);
  const to = normalizeAlertSubscriberEmail(input?.toEmail);
  if (!to) {
    throw new Error('Recipient subscriber email is invalid.');
  }

  const rendered = renderPriceAlertEmail(input);
  const fetchFn = input.fetchImpl ?? fetch;
  const timeoutMs = clampTimeoutMs(input.timeoutMs);

  const response = await fetchFn(`${RESEND_API_BASE_URL}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  if (response.status < 200 || response.status >= 300) {
    const safeSnippet = stripHeaderCrLf(rawBody, 240);
    throw new Error(
      `Resend POST /emails failed with HTTP ${response.status}${safeSnippet ? `: ${safeSnippet}` : ''}`
    );
  }

  let messageId: string | null = null;
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as { id?: unknown };
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
        const cleanId = stripHeaderCrLf(parsed.id, 128);
        if (cleanId) messageId = cleanId;
      }
    } catch {
      // A 2xx response without JSON body still succeeded at the HTTP layer.
    }
  }

  return {
    id: messageId,
    status: response.status,
  };
}

/**
 * Fetches all paginated contacts from `GET /audiences/:audienceId/contacts` and returns
 * a lowercase `Set<string>` of addresses where `unsubscribed === true`.
 * Fails closed (throws) on any HTTP error, network timeout, malformed body, missing `has_more`,
 * or stalled cursor.
 */
export async function fetchResendUnsubscribedEmails(
  options: FetchResendUnsubscribedOptions
): Promise<Set<string>> {
  const apiKey = validateResendApiKey(options?.resendApiKey);
  const audienceId = validateResendAudienceId(options?.audienceId);
  const fetchFn = options.fetchImpl ?? fetch;
  const timeoutMs = clampTimeoutMs(options.timeoutMs);
  const maxPages =
    typeof options.maxPages === 'number' &&
    Number.isSafeInteger(options.maxPages) &&
    options.maxPages >= 1
      ? Math.min(options.maxPages, MAX_RESEND_SUPPRESSION_PAGES)
      : MAX_RESEND_SUPPRESSION_PAGES;

  const unsubscribed = new Set<string>();
  const seenCursors = new Set<string>();
  let afterCursor: string | null = null;
  let pagesFetched = 0;

  for (;;) {
    pagesFetched += 1;
    if (pagesFetched > maxPages) {
      throw new Error(`Resend audience contacts exceeded maxPages (${maxPages}).`);
    }

    const query =
      afterCursor === null ? '?limit=100' : `?limit=100&after=${encodeURIComponent(afterCursor)}`;
    const url = `${RESEND_API_BASE_URL}/audiences/${encodeURIComponent(audienceId)}/contacts${query}`;

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawBody = await response.text();
    if (response.status < 200 || response.status >= 300) {
      const safeSnippet = stripHeaderCrLf(rawBody, 240);
      throw new Error(
        `Resend GET /audiences/contacts failed with HTTP ${response.status}${safeSnippet ? `: ${safeSnippet}` : ''}`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error('Resend GET /audiences/contacts returned invalid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Resend GET /audiences/contacts returned non-object payload.');
    }
    const payload = parsed as {
      data?: unknown;
      has_more?: unknown;
    };
    if (!Array.isArray(payload.data)) {
      throw new Error('Resend GET /audiences/contacts payload is missing data array.');
    }
    if (typeof payload.has_more !== 'boolean') {
      throw new Error('Resend GET /audiences/contacts payload is missing boolean has_more.');
    }

    for (const item of payload.data) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const contact = item as { email?: unknown; unsubscribed?: unknown };
      if (contact.unsubscribed !== true) continue;
      const normalized = normalizeAlertSubscriberEmail(contact.email);
      if (normalized) {
        unsubscribed.add(normalized);
      }
    }

    if (!payload.has_more) {
      break;
    }

    const tail = payload.data[payload.data.length - 1] as { id?: unknown } | undefined;
    const rawNextCursor =
      tail && typeof tail === 'object' && typeof tail.id === 'string' ? tail.id.trim() : '';
    if (
      !rawNextCursor ||
      rawNextCursor.length > 128 ||
      /[\s\p{Cc}\p{Cf}]/u.test(rawNextCursor) ||
      seenCursors.has(rawNextCursor)
    ) {
      throw new Error(
        'Resend GET /audiences/contacts indicated has_more without an advancing cursor id.'
      );
    }
    seenCursors.add(rawNextCursor);
    afterCursor = rawNextCursor;
  }

  return unsubscribed;
}
