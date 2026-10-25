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
    return (
      <div
        className={`d-inline-flex align-items-center gap-1 ${className}`.trim()}
      >
        {includeWatchlist && (
          <WatchlistQuickToggle
            compact
            item={{
              slug: item.slug,
              name: item.name,
              brand: item.brand,
              thumbnail: item.thumbnail,
              min_price: item.min_price,
              categoryPath: item.categoryPath,
            }}
          />
        )}
        <button
          type="button"
          onClick={handleToggle}
          title={title}
          aria-label={`${t('quickToggleShortAdd')}: ${item.name}`}
          aria-pressed={selected}
          className={`rate-chip-btn${selected ? ' is-active' : ''}${limitAlert ? ' is-warning' : ''}`}
        >
          {selected ? (
            <BsCheckLg aria-hidden="true" />
          ) : (
            <BsPlusLg aria-hidden="true" />
          )}
          <span>
            {limitAlert
              ? t('quickToggleShortLimit')
              : selected
                ? t('quickToggleShortSelected')
                : t('quickToggleShortAdd')}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="d-inline-flex align-items-center flex-wrap gap-1">
      {includeWatchlist && (
        <WatchlistQuickToggle
          item={{
            slug: item.slug,
            name: item.name,
            brand: item.brand,
            thumbnail: item.thumbnail,
            min_price: item.min_price,
            categoryPath: item.categoryPath,
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
        className={`btn ${
          limitAlert
            ? 'btn-warning text-dark'
            : selected
              ? 'btn-danger text-white'
              : 'btn-outline-secondary text-dark bg-white'
        } ${size === 'sm' ? 'btn-sm small px-2 py-1' : 'px-3 py-2'} rounded-pill fw-medium d-inline-flex align-items-center gap-1 shadow-sm ${className}`}
        style={{ fontSize: size === 'sm' ? '0.8125rem' : '13.5px' }}
      >
        <span>
          {limitAlert
            ? t('quickToggleLimitBtn')
            : selected
              ? t('quickToggleSelectedBtn')
              : t('quickToggleAddBtn')}
        </span>
      </button>
    </div>
  );
}
