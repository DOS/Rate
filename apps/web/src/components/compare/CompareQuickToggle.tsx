'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  type CompareTrayItem,
  getCompareTray,
  subscribeCompareTray,
  toggleCompareTrayItem,
} from './compare-tray';
import WatchlistQuickToggle from '@/components/watchlist/WatchlistQuickToggle';

interface CompareQuickToggleProps {
  item: CompareTrayItem & { categoryPath?: string };
  size?: 'sm' | 'md';
  className?: string;
  includeWatchlist?: boolean;
}

export default function CompareQuickToggle({
  item,
  size = 'sm',
  className = '',
  includeWatchlist = true,
}: CompareQuickToggleProps) {
  const t = useTranslations('compare');
  const [selected, setSelected] = useState(false);
  const [limitAlert, setLimitAlert] = useState(false);

  useEffect(() => {
    const sync = () => {
      const tray = getCompareTray();
      setSelected(tray.some((x) => x.slug === item.slug));
    };
    sync();
    return subscribeCompareTray(sync);
  }, [item.slug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const res = toggleCompareTrayItem(item);
    if (res.limitReached) {
      setLimitAlert(true);
      setTimeout(() => setLimitAlert(false), 2200);
    }
  };

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
