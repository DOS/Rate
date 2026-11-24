'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsChevronDown, BsChevronUp, BsPhone } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { buildWatchlistComboHref } from '@/lib/combo-cart-links';
import type { CanonicalCategorySlug } from '@/lib/rate-domain';
import { resolveListingPriceCurrency } from '@/lib/rate-domain-core';
import {
  clearCompareTray,
  type CompareTrayItem,
  getCompareTray,
  MAX_COMPARE_ITEMS,
  normalizeCompareTrayItems,
  normalizeTrayItem,
  sanitizeTrayPriceVnd,
  sanitizeTraySlug,
  setCompareTray,
  subscribeCompareTray,
} from './compare-tray';
import { formatListingPrice, formatPriceVnd } from '@/lib/locale-format';

// Per-tab memory of the user's last choice; phones start collapsed (#607).
const COLLAPSED_KEY = 'rate_compare_tray_collapsed';
const PHONE_QUERY = '(max-width: 767.98px)';

export function formatCompareTrayPriceVnd(
  value: unknown,
  locale?: string | null,
  currency?: string | null
): string {
  const safe = sanitizeTrayPriceVnd(value, currency);
  return currency
    ? formatListingPrice(safe, currency, locale)
    : formatPriceVnd(safe, locale);
}

export function formatCompareTrayPriceDisplay(
  value: unknown,
  locale?: string | null,
  currency?: string | null
): string {
  const safePrice = sanitizeTrayPriceVnd(value, currency);
  if (safePrice <= 0) return '-';
  return currency
    ? formatListingPrice(safePrice, currency, locale)
    : formatPriceVnd(safePrice, locale);
}

export function resolveCompareTrayPrimaryCategory(
  items: readonly CompareTrayItem[]
): CanonicalCategorySlug {
  if (!Array.isArray(items) || items.length === 0) return 'smartphones';
  const normalized = normalizeCompareTrayItems(items);
  if (normalized.length > 0 && normalized[0]!.categorySlug) {
    return normalized[0]!.categorySlug;
  }
  const first =
    items.find(
      (x) =>
        x &&
        typeof x === 'object' &&
        !Array.isArray(x) &&
        Boolean(sanitizeTraySlug(x.slug))
    ) ?? items[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return 'smartphones';
  }
  return normalizeTrayItem(first).categorySlug ?? 'smartphones';
}

export function buildCompareTrayHref(
  items: readonly CompareTrayItem[]
): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '/compare?cat=smartphones';
  }
  const normalized = normalizeCompareTrayItems(items);
  const primaryCategory =
    normalized[0]?.categorySlug ?? resolveCompareTrayPrimaryCategory(items);
  const sourceItems = normalized.length > 0 ? normalized : items;
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const item of sourceItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (
      normalized.length === 0 &&
      (normalizeTrayItem(item).categorySlug ?? 'smartphones') !==
        primaryCategory
    ) {
      continue;
    }
    const cleanSlug = sanitizeTraySlug(item.slug);
    if (!cleanSlug || seen.has(cleanSlug)) continue;
    seen.add(cleanSlug);
    slugs.push(encodeURIComponent(cleanSlug));
    if (slugs.length >= MAX_COMPARE_ITEMS) break;
  }
  if (slugs.length === 0) {
    return `/compare?cat=${encodeURIComponent(primaryCategory)}`;
  }
  return `/compare?cat=${encodeURIComponent(primaryCategory)}&slugs=${slugs.join(',')}`;
}

export interface CompareTrayBarProps {
  initialItems?: readonly CompareTrayItem[];
}

export default function CompareTrayBar({ initialItems }: CompareTrayBarProps) {
  const t = useTranslations('compare');
  const locale = useLocale();
  const hasInitialItems = initialItems !== undefined;
  const [items, setItems] = useState<CompareTrayItem[]>(() =>
    initialItems ? normalizeCompareTrayItems(initialItems) : []
  );
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setItems(getCompareTray());
    };
    if (!hasInitialItems) {
      sync();
    }
    return subscribeCompareTray(sync);
  }, [hasInitialItems]);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem(COLLAPSED_KEY);
    } catch {
      // Storage blocked: fall back to the viewport default.
    }
    const isPhoneViewport =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(PHONE_QUERY).matches;
    setCollapsed(saved != null ? saved === '1' : isPhoneViewport);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not persisted; the toggle still works for this page.
      }
      return next;
    });
  };

  if (items.length === 0) {
    return null;
  }

  const compareHref = buildCompareTrayHref(items);
  const comboCartHref =
    items.length >= 2
      ? buildWatchlistComboHref(
          items.map((item) => item.slug),
          { minItems: 2 }
        )
      : null;

  const handleRemove = (slug: string) => {
    setCompareTray(items.filter((x) => x.slug !== slug));
  };

  return (
    <div
      className="position-fixed translate-middle-x start-50 bottom-0 mb-3 px-3"
      style={{ zIndex: 1055, width: '100%', maxWidth: '960px' }}
    >
      <div
        className="card rate-ink-on-dark rounded-4 overflow-hidden border-0 text-white shadow-lg"
        style={{ background: 'var(--rate-bg-dark-elevated)' }}
      >
        <div className="card-body px-3 py-2">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-danger rounded-pill px-2 py-1">
                {items.length} / {MAX_COMPARE_ITEMS}
              </span>
              <span
                className={`fw-bold small ${collapsed ? 'd-none d-sm-inline' : ''}`}
              >
                {t('trayTitle')}
              </span>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-controls="rate-compare-tray-items"
                aria-label={collapsed ? t('trayExpand') : t('trayCollapse')}
                className="btn btn-link btn-sm text-light text-decoration-none small d-inline-flex align-items-center gap-1 ms-1 p-1 opacity-75"
              >
                {collapsed ? (
                  <BsChevronUp aria-hidden="true" />
                ) : (
                  <BsChevronDown aria-hidden="true" />
                )}
                <span className="d-none d-sm-inline">
                  {collapsed ? t('trayExpand') : t('trayCollapse')}
                </span>
              </button>
            </div>

            <div className="d-flex align-items-center justify-content-end flex-wrap gap-2">
              {!collapsed && (
                <button
                  type="button"
                  onClick={clearCompareTray}
                  className="btn btn-sm btn-outline-light rounded-pill small text-nowrap px-3 py-1"
                >
                  {t('trayClearAll')}
                </button>
              )}
              {!collapsed && comboCartHref && (
                <Link
                  href={comboCartHref}
                  prefetch={false}
                  data-testid="compare-tray-combo-btn"
                  className="btn btn-sm btn-outline-light rounded-pill fw-semibold text-nowrap px-3 py-1"
                >
                  {t('trayComboCartBtn', { count: items.length })}
                </Link>
              )}
              <Link
                href={compareHref}
                className="btn btn-sm btn-danger rounded-pill fw-bold text-nowrap px-3 py-1 shadow-sm"
              >
                {t('trayCompareNow', { count: items.length })}
              </Link>
            </div>
          </div>

          {!collapsed && (
            <div
              id="rate-compare-tray-items"
              className="row g-2 border-top border-secondary border-opacity-25 mt-2 pt-2"
            >
              {items.map((item) => (
                <div key={item.slug} className="col-md-3 col-6">
                  <div
                    className="d-flex align-items-center rounded-3 position-relative gap-2 p-2"
                    style={{ background: 'rgba(255,255,255,0.06)' }}
                  >
                    <div
                      className="rounded-2 d-none d-sm-flex align-items-center justify-content-center flex-shrink-0 bg-white"
                      style={{ width: '40px', height: '40px', padding: '3px' }}
                    >
                      {item.thumbnail ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={item.thumbnail}
                          alt={item.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <span
                          className="text-muted"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          <BsPhone aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="flex-grow-1 overflow-hidden">
                      <div
                        className="fw-semibold text-truncate text-white"
                        style={{ fontSize: '0.8125rem' }}
                        title={item.name}
                      >
                        {item.name}
                      </div>
                      <div
                        className="text-warning fw-bold rate-tabular text-nowrap"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {formatCompareTrayPriceDisplay(
                          item.min_price,
                          locale,
                          resolveListingPriceCurrency({
                            categorySlug:
                              item.categorySlug ??
                              (typeof item.categoryPath === 'string'
                                ? item.categoryPath.replace(/^\//, '')
                                : undefined),
                          })
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.slug)}
                      className="rate-remove-target btn btn-sm text-light d-inline-flex align-items-center justify-content-center p-0 opacity-75"
                      title={t('trayRemoveTitle')}
                      aria-label={t('trayRemoveAria', { name: item.name })}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
