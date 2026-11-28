'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsBell, BsBellFill } from 'react-icons/bs';
import {
  computeWatchlistTargetPrice,
  getWatchlist,
  removeWatchlistItem,
  sanitizeWatchlistPrice,
  sanitizeWatchlistSlug,
  subscribeWatchlist,
  upsertWatchlistItem,
} from './watchlist-store';
import { Button } from '@/components/ui/button';
import { resolveListingPriceCurrency } from '@/lib/rate-domain';
import { cn } from '@/lib/utils';

export function normalizeQuickWatchlistSlug(value: unknown): string {
  return sanitizeWatchlistSlug(value);
}

export type WatchlistQuickToggleTranslate = (
  key:
    | 'quickToggleShortWatched'
    | 'quickToggleShortUnwatched'
    | 'quickToggleBtnWatched'
    | 'quickToggleBtnUnwatched'
) => string;

// Keep the active visible label inside aria-label without parentheses so
// axe-core 4.14 label-content-name-mismatch passes WCAG 2.5.3 (DOS/Rate#1666).
export function formatWatchlistQuickToggleAriaLabel(
  visibleLabel: string,
  itemName: unknown
): string {
  const label = visibleLabel
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\p{Cc}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name =
    typeof itemName === 'string'
      ? itemName
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\p{Cc}+/gu, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  if (!name) return label;
  if (!label) return name;
  return `${label}: ${name}`;
}

export function resolveWatchlistQuickToggleA11y(
  t: WatchlistQuickToggleTranslate,
  options: {
    compact?: boolean;
    watched: boolean;
    itemName: unknown;
  }
): {
  visibleLabel: string;
  ariaLabel: string;
  ariaPressed: boolean;
} {
  const { compact = false, watched, itemName } = options;
  const visibleLabel = compact
    ? watched
      ? t('quickToggleShortWatched')
      : t('quickToggleShortUnwatched')
    : watched
      ? t('quickToggleBtnWatched')
      : t('quickToggleBtnUnwatched');
  return {
    visibleLabel,
    ariaLabel: formatWatchlistQuickToggleAriaLabel(visibleLabel, itemName),
    ariaPressed: watched,
  };
}

export interface WatchlistQuickItem {
  slug: string;
  name: string;
  brand: string;
  thumbnail: string | null;
  min_price: number;
  currency?: 'VND' | 'PCT';
  categoryPath?: string;
}

interface WatchlistQuickToggleProps {
  item: WatchlistQuickItem;
  size?: 'sm' | 'md';
  className?: string;
  /** Icon plus short label on a neutral chip, for card overlays. */
  compact?: boolean;
}

export default function WatchlistQuickToggle({
  item,
  size = 'sm',
  className = '',
  compact = false,
}: WatchlistQuickToggleProps) {
  const t = useTranslations('watchlist');
  const [watched, setWatched] = useState(false);
  const safeSlug = normalizeQuickWatchlistSlug(item?.slug);

  useEffect(() => {
    const sync = () => {
      if (!safeSlug) {
        setWatched(false);
        return;
      }
      const list = getWatchlist();
      setWatched(list.some((x) => x.slug === safeSlug));
    };
    sync();
    return subscribeWatchlist(sync);
  }, [safeSlug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!safeSlug) return;

    if (watched) {
      removeWatchlistItem(safeSlug);
      return;
    }

    const resolvedCurrency = resolveListingPriceCurrency({
      categorySlug: item?.categoryPath?.replace(/^\/+/, '').split('/')[0],
      currency: item?.currency,
    });
    const basePrice = sanitizeWatchlistPrice(item?.min_price, resolvedCurrency);
    const defaultTarget = computeWatchlistTargetPrice(
      basePrice,
      5,
      resolvedCurrency
    );

    upsertWatchlistItem({
      slug: safeSlug,
      name: item.name,
      brand: item.brand,
      categoryPath: item.categoryPath || '/smartphones',
      currency: resolvedCurrency,
      thumbnail: item.thumbnail,
      priceWhenAdded: basePrice,
      targetPrice: defaultTarget,
      addedAt: new Date().toISOString(),
    });
  };

  if (compact) {
    const {
      visibleLabel: shortLabel,
      ariaLabel,
      ariaPressed,
    } = resolveWatchlistQuickToggleA11y(t, {
      compact: true,
      watched,
      itemName: item?.name,
    });
    return (
      <Button
        type="button"
        variant={watched ? 'outline-primary' : 'outline'}
        size="sm"
        onClick={handleToggle}
        title={
          watched
            ? t('quickToggleTitleWatched')
            : t('quickToggleTitleUnwatched')
        }
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        className={cn(
          'rate-chip-btn',
          watched && 'is-active bg-brand-bg dark:bg-brand-bg',
          className
        )}
      >
        {watched ? (
          <BsBellFill aria-hidden="true" />
        ) : (
          <BsBell aria-hidden="true" />
        )}
        <span>{shortLabel}</span>
      </Button>
    );
  }

  const {
    visibleLabel: btnLabel,
    ariaLabel,
    ariaPressed,
  } = resolveWatchlistQuickToggleA11y(t, {
    compact: false,
    watched,
    itemName: item?.name,
  });

  return (
    <Button
      type="button"
      variant={watched ? 'success' : 'outline'}
      size={size === 'sm' ? 'sm' : 'default'}
      onClick={handleToggle}
      title={
        watched ? t('quickToggleTitleWatched') : t('quickToggleTitleUnwatched')
      }
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={className}
    >
      <span>{btnLabel}</span>
    </Button>
  );
}
