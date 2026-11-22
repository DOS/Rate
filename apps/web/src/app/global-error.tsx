'use client';

import type viMessages from '../../locales/vi.json';
import { PAGE_META_CSP } from '@/lib/csp';
import { normalizeRateLocale, type SupportedRateLocale } from '@/lib/rate-i18n';

export const GLOBAL_ERROR_CATALOG: Record<
  SupportedRateLocale,
  typeof viMessages.errors.global
> = {
  vi: {
    title: 'Đã xảy ra lỗi không xác định',
    tryAgain: 'Thử lại',
    invalidContent: 'Không thể hiển thị nội dung này',
    somethingWentWrong: 'Đã xảy ra sự cố ngoài ý muốn',
    goHome: 'Về trang chủ Rate.vn',
  },
  en: {
    title: 'An unknown error occurred',
    tryAgain: 'Try again',
    invalidContent: 'This content could not be displayed',
    somethingWentWrong: 'Something went wrong',
    goHome: 'Rate.vn home',
  },
  cs: {
    title: 'Nastala neznámá chyba',
    tryAgain: 'Zkusit znovu',
    invalidContent: 'Tenhle obsah se nepodařilo načíst',
    somethingWentWrong: 'Něco se pokazilo',
    goHome: 'Domů na Rate.vn',
  },
};

function detectBrowserLocale(): SupportedRateLocale {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=(vi|en|cs)\b/);
    if (match?.[1]) {
      return normalizeRateLocale(match[1]);
    }
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('cs')) return 'cs';
    if (lang.startsWith('en')) return 'en';
  }
  return 'vi';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = detectBrowserLocale();
  const copy = GLOBAL_ERROR_CATALOG[locale];

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Security-Policy" content={PAGE_META_CSP} />
        <meta name="color-scheme" content="dark" />
        <title>{`${copy.title} - Rate.vn`}</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f1113',
          color: '#f1f5f9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#16191d',
            border: '1px solid #262b33',
            borderRadius: '16px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(216, 48, 48, 0.15)',
              color: '#ff6b6b',
              fontWeight: 700,
              fontSize: '0.8125rem',
              padding: '6px 12px',
              borderRadius: '999px',
              marginBottom: '16px',
            }}
          >
            RATE.VN
          </div>
          <h1
            style={{ fontSize: '22px', margin: '0 0 12px', color: '#ffffff' }}
          >
            {copy.somethingWentWrong}
          </h1>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              color: '#94a3b8',
              margin: '0 0 20px',
            }}
          >
            {copy.invalidContent}
            {error?.digest ? ` (${error.digest})` : ''}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              backgroundColor: '#d83030',
              color: '#ffffff',
              border: 'none',
              borderRadius: '999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            {copy.tryAgain}
          </button>
        </div>
      </body>
    </html>
  );
}
