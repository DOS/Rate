'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useId,
  useTransition,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FaChevronDown } from 'react-icons/fa6';

import { AppLocale } from '@/types/general';
import { routing, usePathname, useRouter } from '@/lib/navigation';

const FlagVN = () => (
  <svg
    width="18"
    height="12"
    viewBox="0 0 3 2"
    style={{
      borderRadius: '2px',
      display: 'inline-block',
      flexShrink: 0,
      boxShadow: '0 0 1px rgba(0,0,0,0.3)',
    }}
  >
    <rect width="3" height="2" fill="#da251d" />
    <polygon
      points="1.5,0.4 1.635,0.815 2.07,0.815 1.718,1.071 1.853,1.485 1.5,1.229 1.147,1.485 1.282,1.071 0.93,0.815 1.365,0.815"
      fill="#ffff00"
    />
  </svg>
);

// The switcher renders twice (phone and desktop), so the clip ids must be
// unique per instance: fixed ids were duplicated on every page and one copy's
// url(#...) resolved into the other (DOS/Rate#1079).
const FlagEN = () => {
  const clipId = useId();
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 60 30"
      style={{
        borderRadius: '2px',
        display: 'inline-block',
        flexShrink: 0,
        boxShadow: '0 0 1px rgba(0,0,0,0.3)',
      }}
    >
      <clipPath id={`${clipId}s`}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={`${clipId}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${clipId}s)`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${clipId}t)`}
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
};

const FlagCS = () => (
  <svg
    width="18"
    height="12"
    viewBox="0 0 3 2"
    style={{
      borderRadius: '2px',
      display: 'inline-block',
      flexShrink: 0,
      boxShadow: '0 0 1px rgba(0,0,0,0.3)',
    }}
  >
    <rect width="3" height="1" fill="#fff" />
    <rect y="1" width="3" height="1" fill="#d7141a" />
    <polygon points="0,0 1.5,1 0,2" fill="#11457e" />
  </svg>
);

interface LocaleConfig {
  label: string;
  flag: React.ReactNode;
  short: string;
}

const localeConfig: Record<string, LocaleConfig> = {
  vi: { label: 'Tiếng Việt', flag: <FlagVN />, short: 'VI' },
  en: { label: 'English', flag: <FlagEN />, short: 'EN' },
  cs: { label: 'Čeština', flag: <FlagCS />, short: 'CS' },
};

interface LocaleSwitcherProps {
  locale?: AppLocale;
  className?: string;
  isDarkHeader?: boolean;
  compact?: boolean;
}

const SUPPORTED_SWITCHER_LOCALES = new Set<string>(routing.locales);

export function sanitizeSwitcherLocale(
  value: unknown,
  fallback: AppLocale = 'vi'
): AppLocale {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  if (SUPPORTED_SWITCHER_LOCALES.has(cleaned)) {
    return cleaned as AppLocale;
  }
  return fallback;
}

export function sanitizeSwitcherQueryString(rawSearch: unknown): string {
  if (typeof rawSearch !== 'string') return '';
  const cleaned = rawSearch
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .replace(/^\?+/, '')
    .slice(0, 1024);
  if (!cleaned) return '';
  try {
    return new URLSearchParams(cleaned).toString();
  } catch {
    return '';
  }
}

export function LocaleSwitcher({
  locale: propLocale,
  className,
  isDarkHeader = false,
  compact = false,
}: LocaleSwitcherProps) {
  const contextLocale = useLocale();
  const tNav = useTranslations('rate.nav');
  const currentLocale = sanitizeSwitcherLocale(
    propLocale || contextLocale,
    sanitizeSwitcherLocale(contextLocale, 'vi')
  );
  const [isOpen, setIsOpen] = useState(false);
  const [, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (nextLocale: string) => {
    setIsOpen(false);
    const safeNextLocale = sanitizeSwitcherLocale(nextLocale, currentLocale);
    if (safeNextLocale === currentLocale) return;

    if (typeof document !== 'undefined') {
      document.cookie = `NEXT_LOCALE=${safeNextLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }

    // Read at click time: useSearchParams would make the switcher
    // client-only on cached pages, so it popped in after hydration and
    // shifted the navbar (DOS/Rate#515).
    const queryParams = sanitizeSwitcherQueryString(window.location.search);
    startTransition(() => {
      router.replace(
        queryParams.length > 0 ? `${pathname}?${queryParams}` : pathname,
        { locale: safeNextLocale }
      );
      router.refresh();
    });
  };

  const active = localeConfig[currentLocale] || {
    label: currentLocale.toUpperCase(),
    flag: '🌐',
    short: currentLocale.toUpperCase(),
  };

  return (
    <div
      className={`position-relative d-inline-flex align-items-center ${className || ''}`}
      ref={dropdownRef}
      style={{ verticalAlign: 'middle' }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`d-inline-flex align-items-center justify-content-center rounded-2 border transition-all ${
          compact ? 'gap-1' : 'gap-2'
        }`}
        style={{
          height: compact ? '38px' : '48px',
          // The compact switcher sits in the phone header, which has to fit
          // 320px (DOS/Rate#809) with the widest label: "EN" and "CS" are
          // ~5px wider than "VI" and pushed the menu toggle's tap area off
          // screen (DOS/Rate#1082).
          padding: compact ? '0 5px' : '0 14px',
          backgroundColor: isDarkHeader
            ? 'rgba(255, 255, 255, 0.12)'
            : 'var(--bs-card-bg, #ffffff)',
          borderColor: isDarkHeader
            ? 'rgba(255, 255, 255, 0.25)'
            : 'var(--rate-border-strong)',
          color: isDarkHeader ? '#ffffff' : 'var(--bs-body-color, #1e293b)',
          fontSize: compact ? '13px' : '14px',
          fontWeight: 600,
          lineHeight: 1,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          cursor: 'pointer',
        }}
        aria-expanded={isOpen}
        aria-label={tNav('selectLanguageAria')}
      >
        <span className="d-flex align-items-center">{active.flag}</span>
        <span style={{ letterSpacing: '0.5px' }}>{active.short}</span>
        <FaChevronDown
          style={{ fontSize: '10px', opacity: 0.8, marginLeft: '1px' }}
        />
      </button>

      {isOpen && (
        <ul
          className="dropdown-menu show rounded-3 position-absolute m-0 border p-1 shadow-lg"
          style={{
            minWidth: '155px',
            zIndex: 99999,
            top: 'calc(100% + 6px)',
            right: 0,
            left: 'auto',
            backgroundColor: 'var(--rate-bg-surface)',
            borderColor: 'var(--rate-border-subtle)',
          }}
        >
          {routing.locales.map((loc) => {
            const item = localeConfig[loc] || {
              label: loc.toUpperCase(),
              flag: '🌐',
              short: loc.toUpperCase(),
            };
            const isSelected = loc === currentLocale;
            return (
              <li key={loc}>
                <button
                  type="button"
                  onClick={() => handleSelect(loc)}
                  className={`dropdown-item d-flex align-items-center justify-content-between rounded-2 w-100 border-0 px-2.5 py-2 text-start ${
                    isSelected ? 'bg-light text-primary fw-bold' : 'text-dark'
                  }`}
                  style={{ fontSize: '13px', cursor: 'pointer' }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <span className="d-flex align-items-center">
                      {item.flag}
                    </span>
                    <span>{item.label}</span>
                  </span>
                  {isSelected && (
                    <span className="text-primary fw-bold">✓</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default LocaleSwitcher;
