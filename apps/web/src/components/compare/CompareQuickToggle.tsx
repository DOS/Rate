'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsCheckLg, BsPlusLg } from 'react-icons/bs';
import {
  type CompareTrayItem,
  getCompareTray,
  sanitizeTraySlug,
  subscribeCompareTray,
  toggleCompareTrayItem,
} from './compare-tray';
import WatchlistQuickToggle from '@/components/watchlist/WatchlistQuickToggle';

export function normalizeQuickCompareSlug(value: unknown): string {
  return sanitizeTraySlug(value);
}

export type CompareQuickToggleTranslate = (
  key:
    | 'quickToggleShortLimit'
    | 'quickToggleShortSelected'
    | 'quickToggleShortAdd'
    | 'quickToggleLimitBtn'
    | 'quickToggleSelectedBtn'
    | 'quickToggleAddBtn'
) => string;

// Keep the active visible label inside aria-label without parentheses so
// axe-core 4.14 label-content-name-mismatch passes WCAG 2.5.3 (DOS/Rate#1666).
export function formatCompareQuickToggleAriaLabel(
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

export function resolveCompareQuickToggleA11y(
  t: CompareQuickToggleTranslate,
  options: {
    compact?: boolean;
    selected: boolean;
    limitAlert: boolean;
    itemName: unknown;
  }
): {
  visibleLabel: string;
  ariaLabel: string;
  ariaPressed: boolean;
} {
  const { compact = false, selected, limitAlert, itemName } = options;
  const visibleLabel = compact
    ? limitAlert
      ? t('quickToggleShortLimit')
      : selected
        ? t('quickToggleShortSelected')
        : t('quickToggleShortAdd')
    : limitAlert
      ? t('quickToggleLimitBtn')
      : selected
        ? t('quickToggleSelectedBtn')
        : t('quickToggleAddBtn');
  return {
    visibleLabel,
    ariaLabel: formatCompareQuickToggleAriaLabel(visibleLabel, itemName),
    ariaPressed: selected,
  };
}

interface CompareQuickToggleProps {
  item: CompareTrayItem & { categoryPath?: string };
  size?: 'sm' | 'md';
  className?: string;
  includeWatchlist?: boolean;
  /** Icon plus short label on a neutral chip, for card overlays. */
  compact?: boolean;
}

export default function CompareQuickToggle({
  item,
  size = 'sm',
  className = '',
  includeWatchlist = true,
  compact = false,
}: CompareQuickToggleProps) {
  const t = useTranslations('compare');
  const [selected, setSelected] = useState(false);
  const [limitAlert, setLimitAlert] = useState(false);
  const safeSlug = normalizeQuickCompareSlug(item?.slug);

  useEffect(() => {
    const sync = () => {
      if (!safeSlug) {
        setSelected(false);
        return;
      }
      const tray = getCompareTray();
      setSelected(tray.some((x) => x.slug === safeSlug));
    };
    sync();
    return subscribeCompareTray(sync);
  }, [safeSlug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!safeSlug) return;
    const res = toggleCompareTrayItem({
      ...item,
      slug: safeSlug,
    });
    if (res.limitReached) {
      setLimitAlert(true);
      setTimeout(() => setLimitAlert(false), 2200);
    }
  };

  if (compact) {
    const title = limitAlert
      ? t('quickToggleLimitTitle')
      : selected
        ? t('quickToggleRemoveTitle')
        : t('quickToggleAddTitle');
    const {
      visibleLabel: shortLabel,
      ariaLabel,
      ariaPressed,
    } = resolveCompareQuickToggleA11y(t, {
      compact: true,
      selected,
      limitAlert,
      itemName: item?.name,
    });
    return (
      <div
        className={`d-inline-flex align-items-center gap-1 ${className}`.trim()}
      >
        {includeWatchlist && (
          <WatchlistQuickToggle
            compact
            item={{
              slug: item?.slug ?? '',
              name: item?.name ?? '',
              brand: item?.brand ?? '',
              thumbnail: item?.thumbnail ?? null,
              min_price: item?.min_price ?? 0,
              currency: item?.currency,
              categoryPath: item?.categoryPath,
            }}
          />
        )}
        <button
          type="button"
          onClick={handleToggle}
          title={title}
          aria-label={ariaLabel}
          aria-pressed={ariaPressed}
          className={`rate-chip-btn${selected ? ' is-active' : ''}${limitAlert ? ' is-warning' : ''}`}
        >
          {selected ? (
            <BsCheckLg aria-hidden="true" />
          ) : (
            <BsPlusLg aria-hidden="true" />
          )}
          <span>{shortLabel}</span>
        </button>
      </div>
    );
  }

  const {
    visibleLabel: btnLabel,
    ariaLabel,
    ariaPressed,
  } = resolveCompareQuickToggleA11y(t, {
    compact: false,
    selected,
    limitAlert,
    itemName: item?.name,
  });

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-1">
      {includeWatchlist && (
        <WatchlistQuickToggle
          item={{
            slug: item?.slug ?? '',
            name: item?.name ?? '',
            brand: item?.brand ?? '',
            thumbnail: item?.thumbnail ?? null,
            min_price: item?.min_price ?? 0,
            currency: item?.currency,
            categoryPath: item?.categoryPath,
          }}
          size={size}
        />
      )}
      <button
        type="button"
        onClick={handleToggle}
        title={
          limitAlert
            ? t('quickToggleLimitTitle')
            : selected
              ? t('quickToggleRemoveTitle')
              : t('quickToggleAddTitle')
        }
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        className={`btn ${
          limitAlert
            ? 'btn-warning text-dark'
            : selected
              ? 'btn-danger text-white'
              : 'btn-outline-secondary text-dark bg-white'
        } ${size === 'sm' ? 'btn-sm small px-2 py-1' : 'px-3 py-2'} rounded-pill fw-medium d-inline-flex align-items-center gap-1 shadow-sm ${className}`}
        style={{ fontSize: size === 'sm' ? '0.8125rem' : '13.5px' }}
      >
        <span>{btnLabel}</span>
      </button>
    </div>
  );
}
