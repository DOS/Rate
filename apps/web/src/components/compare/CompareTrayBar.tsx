'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsChevronDown, BsChevronUp, BsPhone } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  clearCompareTray,
  type CompareTrayItem,
  getCompareTray,
  MAX_COMPARE_ITEMS,
  sanitizeTrayPriceVnd,
  setCompareTray,
  subscribeCompareTray,
} from './compare-tray';
import { formatPriceVnd } from '@/lib/locale-format';

// Per-tab memory of the user's last choice; phones start collapsed (#607).
const COLLAPSED_KEY = 'rate_compare_tray_collapsed';
const PHONE_QUERY = '(max-width: 767.98px)';

export function formatCompareTrayPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  return formatPriceVnd(sanitizeTrayPriceVnd(value), locale);
}

export default function CompareTrayBar() {
  const t = useTranslations('compare');
  const locale = useLocale();
  const [items, setItems] = useState<CompareTrayItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setItems(getCompareTray());
    };
    sync();
    return subscribeCompareTray(sync);
  }, []);

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

  const compareHref = `/compare?slugs=${items.map((x) => encodeURIComponent(x.slug)).join(',')}`;

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
                        {formatCompareTrayPriceVnd(item.min_price, locale)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.slug)}
                      className="rate-remove-target btn btn-sm text-light d-inline-flex align-items-center justify-content-center p-0 opacity-75"
                      title={t('trayRemoveTitle')}
                      aria-label={t('trayRemoveAria', { name: item.name })}
                    >
                      ×
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
