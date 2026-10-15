'use client';

import React, { useEffect, useState } from 'react';
import {
  getWatchlist,
  removeWatchlistItem,
  subscribeWatchlist,
  upsertWatchlistItem,
} from './watchlist-store';

export interface WatchlistQuickItem {
  slug: string;
  name: string;
  brand: string;
  thumbnail: string | null;
  min_price: number;
  categoryPath?: string;
}

interface WatchlistQuickToggleProps {
  item: WatchlistQuickItem;
  size?: 'sm' | 'md';
  className?: string;
}

export default function WatchlistQuickToggle({
  item,
  size = 'sm',
  className = '',
}: WatchlistQuickToggleProps) {
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    const sync = () => {
      const list = getWatchlist();
      setWatched(list.some((x) => x.slug === item.slug));
    };
    sync();
    return subscribeWatchlist(sync);
  }, [item.slug]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (watched) {
      removeWatchlistItem(item.slug);
      return;
    }

    const basePrice = Math.max(0, Number(item.min_price || 0));
    const defaultTarget =
      basePrice > 0
        ? Math.max(100_000, Math.round((basePrice * 0.95) / 100_000) * 100_000)
        : 10_000_000;

    upsertWatchlistItem({
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      categoryPath: item.categoryPath || '/smartphones',
      thumbnail: item.thumbnail,
      priceWhenAdded: basePrice,
      targetPrice: defaultTarget,
      addedAt: new Date().toISOString(),
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={
        watched
          ? 'Đang theo dõi biến động giá (Bấm để bỏ theo dõi)'
          : 'Theo dõi biến động giá & nhận cảnh báo giảm giá thật (-5%)'
      }
      className={`btn ${
        watched
          ? 'btn-success text-white'
          : 'btn-outline-secondary text-dark bg-white'
      } ${size === 'sm' ? 'btn-sm small px-2 py-1' : 'px-3 py-2'} rounded-pill fw-medium d-inline-flex align-items-center gap-1 shadow-sm ${className}`}
      style={{ fontSize: size === 'sm' ? '12px' : '13.5px' }}
    >
      <span>{watched ? '🔔 Đang canh giá' : '🔔 Canh giá'}</span>
    </button>
  );
}
