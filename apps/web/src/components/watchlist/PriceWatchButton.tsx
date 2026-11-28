'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/lib/navigation';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';
import {
  MIN_WATCHLIST_TARGET_PRICE,
  MIN_WATCHLIST_TARGET_PRICE_PCT,
  computeWatchlistTargetPrice,
  getWatchlist,
  removeWatchlistItem,
  sanitizeWatchlistPrice,
  sanitizeWatchlistSlug,
  sanitizeWatchlistTargetPrice,
  subscribeWatchlist,
  upsertWatchlistItem,
  type WatchlistItem,
} from './watchlist-store';
import {
  formatListingPrice,
  formatNumber,
  formatPriceVnd,
  hasListingUnitSuffix,
  normalizePriceCurrency,
  sanitizeCurrencyPriceValue,
} from '@/lib/locale-format';

export function resolvePriceWatchStep(
  currentMinPrice: unknown,
  currency?: string | null
): number {
  if (normalizePriceCurrency(currency) === 'PCT') {
    return 0.05;
  }
  const safeCurrent = sanitizeWatchlistPrice(currentMinPrice);
  return safeCurrent > 0 && safeCurrent < 2_000_000 ? 10_000 : 100_000;
}

export function sanitizePriceWatchInput(
  rawValue: unknown,
  currentMinPrice: unknown,
  currency?: string | null
): number {
  const resolvedCurrency = normalizePriceCurrency(currency);
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num < 0) {
    return computeWatchlistTargetPrice(
      sanitizeWatchlistPrice(currentMinPrice, resolvedCurrency),
      5,
      resolvedCurrency
    );
  }
  return Math.min(
    MAX_VALID_VND_PRICE,
    sanitizeCurrencyPriceValue(num, resolvedCurrency)
  );
}

export interface PriceWatchKeyEventLike {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
  target?: EventTarget | null;
  composedPath?: () => EventTarget[];
  defaultPrevented?: boolean;
  preventDefault: () => void;
}

function isImeComposingKeyEvent(event: PriceWatchKeyEventLike): boolean {
  return Boolean(
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.keyCode === 229 ||
    event.nativeEvent?.keyCode === 229
  );
}

export function handlePriceWatchPopoverEscape(
  event: PriceWatchKeyEventLike,
  actions: {
    closeEditor: () => void;
    focusTrigger: () => void;
  }
): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented) return false;
  event.preventDefault();
  actions.closeEditor();
  actions.focusTrigger();
  return true;
}

export function handlePriceWatchInputKeyDown(
  event: PriceWatchKeyEventLike,
  actions: {
    saveTarget: () => void;
    closeEditor: () => void;
    focusTrigger: () => void;
  }
): 'saved' | 'closed' | null {
  if (event.defaultPrevented) return null;
  if (event.key === 'Enter') {
    if (isImeComposingKeyEvent(event)) return null;
    event.preventDefault();
    actions.saveTarget();
    return 'saved';
  }
  if (handlePriceWatchPopoverEscape(event, actions)) {
    return 'closed';
  }
  return null;
}

export function shouldDismissPriceWatchOnOutsidePress(
  container: { contains: (node: Node) => boolean } | null,
  event: {
    target?: EventTarget | null;
    composedPath?: () => EventTarget[];
  }
): boolean {
  if (!container) return false;
  const path =
    typeof event.composedPath === 'function' ? event.composedPath() : [];
  if (path.length > 0) {
    return !path.includes(container as unknown as EventTarget);
  }
  const target = event.target as Node | null | undefined;
  if (!target) return false;
  return !container.contains(target);
}

export function handleScopedPriceWatchPopoverEscape(
  container: { contains: (node: Node) => boolean } | null,
  event: PriceWatchKeyEventLike,
  actions: {
    closeEditor: () => void;
    focusTrigger: () => void;
  }
): boolean {
  if (!container || shouldDismissPriceWatchOnOutsidePress(container, event)) {
    return false;
  }
  return handlePriceWatchPopoverEscape(event, actions);
}

interface PriceWatchButtonProps {
  slug: string;
  name: string;
  brand: string;
  categoryPath?: string;
  thumbnail: string | null;
  currentMinPrice: number;
  currency?: 'VND' | 'PCT';
  priceUnit?: string | null;
  size?: 'sm' | 'md';
  /** SSR/unit-test fixture override to render the disclosure open (#1693). */
  defaultOpen?: boolean;
}

export default function PriceWatchButton({
  slug,
  name,
  brand,
  categoryPath = '/smartphones',
  thumbnail,
  currentMinPrice,
  currency,
  priceUnit,
  size = 'md',
  defaultOpen = false,
}: PriceWatchButtonProps) {
  const t = useTranslations('watchlist');
  const locale = useLocale();
  const instanceId = useId();
  const editorId = `${instanceId}-editor`;
  const targetInputId = `${instanceId}-target-input`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const resolvedCurrency =
    currency === 'PCT' || categoryPath === '/bank-savings' ? 'PCT' : 'VND';
  const isPercentCurrency = resolvedCurrency === 'PCT';
  const safeSlug = sanitizeWatchlistSlug(slug);
  const safeCurrentMinPrice = sanitizeWatchlistPrice(
    currentMinPrice,
    resolvedCurrency
  );
  const [watchedItem, setWatchedItem] = useState<WatchlistItem | null>(null);
  const [showEditor, setShowEditor] = useState(Boolean(defaultOpen));
  const [targetInput, setTargetInput] = useState<number>(
    computeWatchlistTargetPrice(safeCurrentMinPrice, 5, resolvedCurrency)
  );

  useEffect(() => {
    const sync = () => {
      const found = getWatchlist().find((x) => x.slug === safeSlug) || null;
      setWatchedItem(found);
      if (found) {
        setTargetInput(found.targetPrice);
      } else if (safeCurrentMinPrice > 0) {
        setTargetInput(
          computeWatchlistTargetPrice(safeCurrentMinPrice, 5, resolvedCurrency)
        );
      }
    };
    sync();
    return subscribeWatchlist(sync);
  }, [safeSlug, safeCurrentMinPrice, resolvedCurrency]);

  useEffect(() => {
    if (!showEditor) return;
    const onPointerDown = (event: PointerEvent) => {
      if (shouldDismissPriceWatchOnOutsidePress(containerRef.current, event)) {
        setShowEditor(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      handleScopedPriceWatchPopoverEscape(containerRef.current, event, {
        closeEditor: () => setShowEditor(false),
        focusTrigger: () => triggerBtnRef.current?.focus(),
      });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showEditor]);

  const handleSave = (customTarget: number) => {
    if (!safeSlug) return;
    const cleanTarget = sanitizeWatchlistTargetPrice(
      customTarget,
      safeCurrentMinPrice,
      resolvedCurrency
    );
    upsertWatchlistItem({
      slug: safeSlug,
      name,
      brand,
      categoryPath,
      thumbnail,
      priceWhenAdded: safeCurrentMinPrice,
      targetPrice: cleanTarget,
      currency: resolvedCurrency,
      addedAt: new Date().toISOString(),
    });
    setShowEditor(false);
    triggerBtnRef.current?.focus();
  };

  const handleRemove = () => {
    if (!safeSlug) return;
    removeWatchlistItem(safeSlug);
    setShowEditor(false);
    triggerBtnRef.current?.focus();
  };

  const preset5Pct = computeWatchlistTargetPrice(
    safeCurrentMinPrice,
    5,
    resolvedCurrency
  );
  const preset10Pct = computeWatchlistTargetPrice(
    safeCurrentMinPrice,
    10,
    resolvedCurrency
  );

  return (
    <div ref={containerRef} className="position-relative d-inline-block">
      <Button
        ref={triggerBtnRef}
        type="button"
        variant={watchedItem ? 'success' : 'outline-primary'}
        size={size === 'sm' ? 'sm' : 'default'}
        aria-expanded={showEditor}
        aria-controls={editorId}
        onClick={() => setShowEditor((prev) => !prev)}
        title={t('btnTitle')}
      >
        {watchedItem
          ? isPercentCurrency ||
            hasListingUnitSuffix(resolvedCurrency, categoryPath, priceUnit)
            ? t('btnWatchingCurrency', {
                price: formatListingPrice(
                  sanitizeWatchlistPrice(
                    watchedItem.targetPrice,
                    resolvedCurrency
                  ),
                  resolvedCurrency,
                  locale,
                  { categorySlug: categoryPath, priceUnit }
                ),
              })
            : t('btnWatching', {
                price: formatNumber(
                  sanitizeWatchlistPrice(watchedItem.targetPrice),
                  locale
                ),
              })
          : t('btnWatch')}
      </Button>

      {showEditor && (
        <div
          id={editorId}
          className="card rounded-4 position-absolute text-dark border bg-white p-3 shadow-lg"
          style={{
            zIndex: 1050,
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: '310px',
          }}
        >
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong className="small">{t('editorTitle')}</strong>
            <button
              type="button"
              className="btn-close small"
              style={{ fontSize: '0.65rem' }}
              onClick={() => {
                setShowEditor(false);
                triggerBtnRef.current?.focus();
              }}
              aria-label={t('closeAria')}
            />
          </div>
          <p className="text-muted mb-2" style={{ fontSize: '0.8125rem' }}>
            {t('currentBestPrice')}{' '}
            <strong className="text-danger">
              {isPercentCurrency ||
              hasListingUnitSuffix(resolvedCurrency, categoryPath, priceUnit)
                ? formatListingPrice(
                    safeCurrentMinPrice,
                    resolvedCurrency,
                    locale,
                    { categorySlug: categoryPath, priceUnit }
                  )
                : formatPriceVnd(safeCurrentMinPrice, locale)}
            </strong>
          </p>

          {!isPercentCurrency && (
            <div className="d-flex mb-2 gap-1">
              <button
                type="button"
                onClick={() => setTargetInput(preset5Pct)}
                className="btn btn-sm btn-light rounded-pill flex-fill border"
                style={{ fontSize: '0.8125rem' }}
              >
                {t('preset5Pct', { price: formatNumber(preset5Pct, locale) })}
              </button>
              <button
                type="button"
                onClick={() => setTargetInput(preset10Pct)}
                className="btn btn-sm btn-light rounded-pill flex-fill border"
                style={{ fontSize: '0.8125rem' }}
              >
                {t('preset10Pct', {
                  price: formatNumber(preset10Pct, locale),
                })}
              </button>
            </div>
          )}

          <div className="input-group input-group-sm mb-2">
            <label htmlFor={targetInputId} className="input-group-text">
              {t('targetInputLabel')}
            </label>
            <input
              id={targetInputId}
              type="number"
              step={resolvePriceWatchStep(
                safeCurrentMinPrice,
                resolvedCurrency
              )}
              min={
                isPercentCurrency
                  ? MIN_WATCHLIST_TARGET_PRICE_PCT
                  : MIN_WATCHLIST_TARGET_PRICE
              }
              value={targetInput}
              onChange={(e) =>
                setTargetInput(
                  sanitizePriceWatchInput(
                    e.target.value,
                    safeCurrentMinPrice,
                    resolvedCurrency
                  )
                )
              }
              onKeyDown={(e) => {
                handlePriceWatchInputKeyDown(e, {
                  saveTarget: () => handleSave(targetInput),
                  closeEditor: () => setShowEditor(false),
                  focusTrigger: () => triggerBtnRef.current?.focus(),
                });
              }}
              className="form-control fw-semibold"
            />
          </div>

          <div className="d-flex justify-content-between align-items-center mt-2 gap-2">
            {watchedItem ? (
              <button
                type="button"
                onClick={handleRemove}
                className="btn btn-sm btn-outline-danger rounded-pill px-2"
              >
                {t('unwatchBtn')}
              </button>
            ) : (
              <Link
                href="/watchlist"
                className="small text-primary text-decoration-none"
              >
                {t('viewWatchlistLink')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => handleSave(targetInput)}
              className="btn btn-sm btn-primary rounded-pill fw-medium ms-auto px-3"
            >
              {t('saveTargetBtn')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
