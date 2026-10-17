export const DEFAULT_API_BASE_URL = 'https://rate.vn';

export const ALLOWED_API_BASE_ORIGINS = [
  'https://rate.vn',
  'https://www.rate.vn',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

export function normalizeAllowedApiBaseUrl(
  rawUrl: string | null | undefined
): string {
  if (typeof rawUrl !== 'string') return DEFAULT_API_BASE_URL;
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_BASE_URL;

  try {
    const parsed = new URL(trimmed);
    const origin = parsed.origin.toLowerCase();
    const isAllowed = (ALLOWED_API_BASE_ORIGINS as readonly string[]).includes(
      origin
    );
    if (!isAllowed) {
      return DEFAULT_API_BASE_URL;
    }
    return origin;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export function isPrivilegedExtensionSender(sender: {
  id?: string;
  tab?: unknown;
  url?: string;
}): boolean {
  if (sender.tab != null) {
    return false;
  }
  if (typeof sender.url === 'string' && sender.url.length > 0) {
    return sender.url.startsWith('chrome-extension://');
  }
  return true;
}

export function escapeSafeExternalHref(
  rawUrl: string | null | undefined,
  fallbackUrl = 'https://rate.vn'
): string {
  if (typeof rawUrl !== 'string') return fallbackUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallbackUrl;
  try {
    const parsed = new URL(trimmed, 'https://rate.vn');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallbackUrl;
    }
    return parsed.href
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  } catch {
    return fallbackUrl;
  }
}
