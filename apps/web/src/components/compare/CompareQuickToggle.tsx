'use client';

import React, { useEffect, useState } from 'react';
import {
  type CompareTrayItem,
  getCompareTray,
  subscribeCompareTray,
  toggleCompareTrayItem,
} from './compare-tray';

interface CompareQuickToggleProps {
  item: CompareTrayItem;
  size?: 'sm' | 'md';
  className?: string;
}

export default function CompareQuickToggle({
  item,
  size = 'sm',
  className = '',
}: CompareQuickToggleProps) {
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
    <button
      type="button"
      onClick={handleToggle}
      title={
        limitAlert
          ? 'Tối đa 4 điện thoại trong bảng so sánh'
          : selected
            ? 'Bỏ khỏi danh sách so sánh'
            : 'Thêm vào danh sách so sánh 10 nhóm thông số'
      }
      className={`btn ${
        limitAlert
          ? 'btn-warning text-dark'
          : selected
            ? 'btn-danger text-white'
            : 'btn-outline-secondary text-dark bg-white'
      } ${size === 'sm' ? 'btn-sm small px-2 py-1' : 'px-3 py-2'} rounded-pill fw-medium d-inline-flex align-items-center gap-1 shadow-sm ${className}`}
      style={{ fontSize: size === 'sm' ? '12px' : '13.5px' }}
    >
      <span>
        {limitAlert
          ? '⚠️ Tối đa 4 máy'
          : selected
            ? '✓ Đã chọn so sánh'
            : '+ So sánh'}
      </span>
    </button>
  );
}
