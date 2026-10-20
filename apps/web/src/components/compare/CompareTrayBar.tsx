'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsPhone } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  clearCompareTray,
  type CompareTrayItem,
  getCompareTray,
  MAX_COMPARE_ITEMS,
  setCompareTray,
  subscribeCompareTray,
} from './compare-tray';

export default function CompareTrayBar() {
  const t = useTranslations('compare');
  const [items, setItems] = useState<CompareTrayItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sync = () => {
      setItems(getCompareTray());
    };
    sync();
    return subscribeCompareTray(sync);
  }, []);

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
        style={{ background: '#16191e' }}
      >
        <div className="card-body px-3 py-2">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-danger rounded-pill px-2 py-1">
                {items.length} / {MAX_COMPARE_ITEMS}
              </span>
              <span className="fw-bold small">{t('trayTitle')}</span>
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="btn btn-link btn-sm text-light text-decoration-none small ms-1 p-0 opacity-75"
              >
                {collapsed ? t('trayExpand') : t('trayCollapse')}
              </button>
            </div>

            <div className="d-flex align-items-center justify-content-end flex-wrap gap-2">
              <button
                type="button"
                onClick={clearCompareTray}
                className="btn btn-sm btn-outline-light rounded-pill small text-nowrap px-3 py-1"
              >
                {t('trayClearAll')}
              </button>
              <Link
                href={compareHref}
                className="btn btn-sm btn-danger rounded-pill fw-bold text-nowrap px-3 py-1 shadow-sm"
              >
                {t('trayCompareNow', { count: items.length })}
              </Link>
            </div>
          </div>

          {!collapsed && (
            <div className="row g-2 border-top border-secondary border-opacity-25 mt-2 pt-2">
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
                        {Number(item.min_price || 0).toLocaleString('vi-VN')} ₫
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.slug)}
                      className="btn btn-sm text-light p-0 px-1 opacity-75"
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
