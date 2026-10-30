'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ContentText from '@/components/elementary/ContentText';
import { BsBell, BsCheckCircle, BsExclamationTriangle } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { escapeCsvCell } from '@/lib/csv-safe';
import type { MasterProduct } from '@repo/shared-data';
import {
  getMasterProductHref,
  resolveCompareEffectiveUserRating,
} from '@/lib/rate-domain';
import {
  MIN_WATCHLIST_TARGET_PRICE,
  computeWatchlistTargetPrice,
  getWatchlist,
  removeWatchlistItem,
  resolveWatchlistItemCurrentPrices,
  sanitizeWatchlistPrice,
  sanitizeWatchlistTargetPrice,
  subscribeWatchlist,
  upsertWatchlistItem,
  type WatchlistItem,
} from './watchlist-store';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  authorizedJsonHeaders,
  jsonWriteHeaders,
} from '@/lib/auth/access-token';
import { productImageUrl } from '@/lib/rate-domain-core';
import { formatStorageLabel } from '@/lib/category-filters';
import {
  isSizeRequiredAnswer,
  watchlistSizeChoices,
  type WatchlistSizeChoice,
} from '@/lib/watchlist-sizes';

interface WatchlistWorkspaceProps {
  catalogProducts: MasterProduct[];
  locale?: string;
}

interface LiveWatchlistDeal {
  /** The product page in its own category (#1380). */
  product_href?: string;
  slug: string;
  current_min_price: number;
  current_max_price: number;
  merchant_count: number;
  platform_count: number;
  offer_platforms: string[];
  best_offer: {
    id: string;
    title: string;
    price: number;
    original_price: number;
    url: string;
    platform: string;
    merchant_name: string;
    is_official_mall: boolean;
  } | null;
  radar_signal?: RadarSignal;
  /** The entry names an Item with several sizes (DOS/Rate#1278). */
  size_required?: true;
}

const PLATFORM_DISPLAY_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiki: 'Tiki',
  tiktok: 'TikTok Shop',
  cellphones: 'CellphoneS',
  tgdd: 'Thế Giới Di Động',
  fptshop: 'FPT Shop',
  hoangha: 'Hoàng Hà Mobile',
  didongviet: 'Di Động Việt',
  phongvu: 'Phong Vũ',
};

export function sanitizeWatchlistBestOfferUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const cleaned = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || !/^https?:\/\//i.test(cleaned)) {
    return null;
  }
  try {
    const parsed = new URL(cleaned);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeWatchlistMarkdownCell(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const cleaned = value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || '-';
}

export function sanitizeWatchlistCount(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(100_000, Math.round(num));
}

export default function WatchlistWorkspace({
  catalogProducts,
  locale,
}: WatchlistWorkspaceProps) {
  const t = useTranslations('watchlist');
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [liveDeals, setLiveDeals] = useState<Record<string, LiveWatchlistDeal>>(
    {}
  );
  const radarIndex = useDealRadarIndex();
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<number>(0);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [copiedPortfolioMd, setCopiedPortfolioMd] = useState<boolean>(false);

  useEffect(() => {
    const sync = () => setItems(getWatchlist());
    sync();
    return subscribeWatchlist(sync);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const slugs = items.map((x) => x.slug).join(',');
    let cancelled = false;
    fetch(`/api/v1/rate/watchlist?slugs=${encodeURIComponent(slugs)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.ok && json.items) {
          setLiveDeals(json.items as Record<string, LiveWatchlistDeal>);
        }
      })
      .catch(() => {
        // Fallback to SSR catalogProducts snapshot
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const productBySlug = new Map<string, MasterProduct>(
    catalogProducts.map((p) => [p.slug, p])
  );

  const handleQuickAddCatalog = (p: MasterProduct) => {
    const minP = Number(p.min_price || 0);
    const targetP = computeWatchlistTargetPrice(minP, 5);
    const thumb = productImageUrl(p);
    const resolvedHref = getMasterProductHref(p);
    const resolvedCategoryPath =
      resolvedHref.replace(`/${p.slug}`, '') || '/smartphones';
    upsertWatchlistItem({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      categoryPath: resolvedCategoryPath,
      thumbnail: thumb,
      priceWhenAdded: minP,
      targetPrice: targetP,
      addedAt: new Date().toISOString(),
    });
  };

  // `/watchlist?add=<slug>` (the browser extension's link, DOS/Rate#1158): add
  // that product once, then drop the parameter so a reload adds nothing. The
  // add is idempotent (by slug), so a second effect run (Strict Mode) is safe.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('add')) return;
    const raw = (url.searchParams.get('add') ?? '').trim();
    // The product route's own slug rule.
    const slug = /^[a-zA-Z0-9._-]{1,120}$/.test(raw) ? raw : '';
    const dropParam = () => {
      const now = new URL(window.location.href);
      now.searchParams.delete('add');
      window.history.replaceState(
        null,
        '',
        `${now.pathname}${now.search}${now.hash}`
      );
    };
    if (!slug || getWatchlist().some((x) => x.slug === slug)) {
      dropParam();
      return;
    }
    fetch(`/api/v1/rate/products/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const product = json?.ok ? (json.data?.product as MasterProduct) : null;
        if (
          product?.slug === slug &&
          !getWatchlist().some((x) => x.slug === slug)
        ) {
          handleQuickAddCatalog(product);
        }
      })
      .catch(() => {
        // An unknown or unreachable product adds nothing.
      })
      .finally(dropParam);
    // Runs once per page load.
  }, []);

  // An entry naming a whole Item needs a size: alerts stay per size
  // (DOS/Rate#1278). The sizes come from the product API's `variants`.
  const [sizePicker, setSizePicker] = useState<{
    slug: string;
    choices: WatchlistSizeChoice[];
  } | null>(null);

  // The entry whose sizes could not be read: it links to its product page.
  const [sizePickerFailed, setSizePickerFailed] = useState<string | null>(null);

  const openSizePicker = (slug: string) => {
    setSizePickerFailed(null);
    const fail = () => {
      setSizePickerFailed(slug);
      setSizePicker((open) => (open?.slug === slug ? null : open));
    };
    fetch(`/api/v1/rate/products/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const choices = watchlistSizeChoices(
          json?.ok ? json.data?.variants : null,
          formatStorageLabel
        );
        if (choices.length > 0) setSizePicker({ slug, choices });
        else fail();
      })
      .catch(fail);
  };

  const chooseSize = async (
    item: WatchlistItem,
    choice: WatchlistSizeChoice
  ) => {
    setSizePicker(null);
    // A size already watched keeps its own entry and target.
    const already = getWatchlist().find((x) => x.slug === choice.slug);
    removeWatchlistItem(item.slug);
    if (already) return;
    const targetPrice =
      choice.minPrice > 0
        ? computeWatchlistTargetPrice(choice.minPrice, 5)
        : item.targetPrice;
    upsertWatchlistItem({
      ...item,
      slug: choice.slug,
      name: choice.name,
      priceWhenAdded: choice.minPrice || item.priceWhenAdded,
      targetPrice,
    });
    // The cloud alert moves to the chosen size too, when signed in.
    const headers = await authorizedJsonHeaders();
    if (!headers) return;
    try {
      await fetch('/api/v1/rate/watchlist', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug: choice.slug,
          targetPrice,
          locale: locale || 'vi',
        }),
      });
    } catch {
      // Local watchlist already updated
    }
  };

  const handleUpdateTarget = async (item: WatchlistItem) => {
    const cleanTarget = sanitizeWatchlistTargetPrice(
      editTarget,
      item.priceWhenAdded
    );
    upsertWatchlistItem({
      ...item,
      targetPrice: cleanTarget,
    });
    setEditingSlug(null);
    // Cloud alerts need a signed-in account; signed-out users keep the local watchlist.
    const headers = await authorizedJsonHeaders();
    if (!headers) return;
    try {
      const res = await fetch('/api/v1/rate/watchlist', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          slug: item.slug,
          targetPrice: cleanTarget,
          locale: locale || 'vi',
        }),
      });
      if (res.status === 422) {
        const payload = await res.json().catch(() => null);
        if (isSizeRequiredAnswer(res.status, payload)) {
          openSizePicker(item.slug);
        }
      }
    } catch {
      // Local watchlist already updated
    }
  };

  const handleSyncAllCloudAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    setCloudSyncStatus(null);
    const headers = await jsonWriteHeaders();
    setIsSyncingCloud(true);
    try {
      const results = await Promise.all(
        items.map(async (item) => {
          const res = await fetch('/api/v1/rate/watchlist', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              slug: item.slug,
              targetPrice: sanitizeWatchlistTargetPrice(
                item.targetPrice,
                item.priceWhenAdded
              ),
              locale: locale || 'vi',
            }),
          });
          const payload = (await res.json().catch(() => null)) as {
            ok?: boolean;
            persistedInCloud?: boolean;
            error?: string;
            code?: string;
          } | null;
          return {
            unauthorized: res.status === 401,
            saved:
              res.ok &&
              payload?.ok === true &&
              payload.persistedInCloud === true,
            error: isSizeRequiredAnswer(res.status, payload)
              ? t('sizeRequiredTitle')
              : typeof payload?.error === 'string'
                ? payload.error
                : null,
          };
        })
      );
      if (results.every((r) => r.unauthorized)) {
        setCloudSyncStatus({
          ok: false,
          message: t('cloudLoginRequired'),
        });
        return;
      }
      const saved = results.filter((r) => r.saved).length;
      const firstError = results.find((r) => !r.saved && r.error)?.error;
      setCloudSyncStatus(
        saved === items.length
          ? {
              ok: true,
              message: t('cloudSavedAll', { saved }),
            }
          : {
              ok: false,
              message: t('cloudSavedPartial', {
                saved,
                total: items.length,
                errorSuffix: firstError ? ` (${firstError})` : '',
              }),
            }
      );
    } catch {
      setCloudSyncStatus({
        ok: false,
        message: t('cloudSaveError'),
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const reachedCount = items.filter((item) => {
    const liveProd = productBySlug.get(item.slug);
    const liveDeal = liveDeals[item.slug];
    const { currentMin } = resolveWatchlistItemCurrentPrices(
      item,
      liveDeal,
      liveProd
    );
    return currentMin > 0 && currentMin <= item.targetPrice;
  }).length;

  const portfolioStats = items.reduce(
    (acc, item) => {
      const liveProd = productBySlug.get(item.slug);
      const liveDeal = liveDeals[item.slug];
      const { currentMin: curMin, currentMax: curMax } =
        resolveWatchlistItemCurrentPrices(item, liveDeal, liveProd);
      const userR = liveProd ? resolveCompareEffectiveUserRating(liveProd) : 0;
      acc.totalMinVnd += curMin;
      acc.totalTargetVnd += item.targetPrice;
      acc.totalSpreadSavingsVnd += Math.max(0, curMax - curMin);
      if (userR > 0) {
        acc.ratingSum += userR;
        acc.ratedCount += 1;
      }
      return acc;
    },
    {
      totalMinVnd: 0,
      totalTargetVnd: 0,
      totalSpreadSavingsVnd: 0,
      ratingSum: 0,
      ratedCount: 0,
    }
  );
  const avgPortfolioRating =
    portfolioStats.ratedCount > 0
      ? Number(
          (portfolioStats.ratingSum / portfolioStats.ratedCount).toFixed(2)
        )
      : 0;

  const handleCopyPortfolioMarkdown = async () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    try {
      const lines = [
        t('mdHeader', { count: items.length }),
        t('mdTotalMin', {
          price: portfolioStats.totalMinVnd.toLocaleString('vi-VN'),
        }),
        t('mdTotalTarget', {
          price: portfolioStats.totalTargetVnd.toLocaleString('vi-VN'),
        }),
        t('mdTotalSpread', {
          price: portfolioStats.totalSpreadSavingsVnd.toLocaleString('vi-VN'),
        }),
        t('mdAvgRating', {
          rating:
            avgPortfolioRating > 0
              ? `${avgPortfolioRating.toFixed(2)}/5.0`
              : t('mdNoRating'),
        }),
        ``,
        t('mdTableHead'),
        `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |`,
        ...items.map((item) => {
          const liveProd = productBySlug.get(item.slug);
          const liveDeal = liveDeals[item.slug];
          const rSig =
            liveDeal?.radar_signal ?? getRadarSignal(radarIndex, item.slug);
          const { currentMin: curMin, currentMax: curMax } =
            resolveWatchlistItemCurrentPrices(item, liveDeal, liveProd);
          const fallbackSpreadVnd = Math.max(0, curMax - curMin);
          const spreadStr = rSig?.priceSpread
            ? `+${rSig.priceSpread.spreadPct}% (${rSig.priceSpread.spreadVnd.toLocaleString('vi-VN')} ₫)`
            : fallbackSpreadVnd > 0
              ? `${fallbackSpreadVnd.toLocaleString('vi-VN')} ₫`
              : '0 ₫';
          const hit = curMin > 0 && curMin <= item.targetPrice;
          const bestOfferStr = liveDeal?.best_offer
            ? `${sanitizeWatchlistMarkdownCell(liveDeal.best_offer.merchant_name)} (${sanitizeWatchlistMarkdownCell(liveDeal.best_offer.platform.toUpperCase())})`
            : sanitizeWatchlistMarkdownCell(
                t('mdSourcesCount', {
                  count: sanitizeWatchlistCount(
                    liveDeal?.merchant_count || liveProd?.merchant_count
                  ),
                })
              );
          return `| ${sanitizeWatchlistMarkdownCell(item.name)} | ${sanitizeWatchlistMarkdownCell(item.brand)} | ${curMin.toLocaleString('vi-VN')} ₫ | ${item.targetPrice.toLocaleString('vi-VN')} ₫ | ${spreadStr} | ${radarMarkdownCell(rSig)} | ${hit ? t('mdStatusReached') : t('mdStatusWatching')} | ${bestOfferStr} |`;
        }),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPortfolioMd(true);
      setTimeout(() => setCopiedPortfolioMd(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadPortfolioCsv = () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const headers = [
      'Slug',
      'Product Name',
      'Brand',
      'Category Path',
      'Current Lowest Price (VND)',
      'Target Price (VND)',
      'Price Spread 10-Platform (VND)',
      'Price Spread 10-Platform (%)',
      'Status',
      'Best Merchant',
      'Platform',
      ...RADAR_CSV_HEADERS,
    ];
    const rows = items.map((item) => {
      const liveProd = productBySlug.get(item.slug);
      const liveDeal = liveDeals[item.slug];
      const rSig =
        liveDeal?.radar_signal ?? getRadarSignal(radarIndex, item.slug);
      const { currentMin: curMin, currentMax: curMax } =
        resolveWatchlistItemCurrentPrices(item, liveDeal, liveProd);
      const spreadVnd =
        rSig?.priceSpread?.spreadVnd ?? Math.max(0, curMax - curMin);
      const spreadPct =
        rSig?.priceSpread?.spreadPct ??
        (curMin > 0 ? Math.round(((curMax - curMin) / curMin) * 1000) / 10 : 0);
      const hit = curMin > 0 && curMin <= item.targetPrice;
      return [
        escapeCsvCell(item.slug),
        escapeCsvCell(item.name),
        escapeCsvCell(item.brand),
        escapeCsvCell(item.categoryPath || '/smartphones'),
        escapeCsvCell(curMin),
        escapeCsvCell(item.targetPrice),
        escapeCsvCell(spreadVnd),
        escapeCsvCell(spreadPct),
        escapeCsvCell(hit ? 'TARGET_REACHED' : 'WATCHING'),
        escapeCsvCell(liveDeal?.best_offer?.merchant_name || ''),
        escapeCsvCell(liveDeal?.best_offer?.platform || ''),
        ...radarCsvCells(rSig).map(escapeCsvCell),
      ].join(',');
    });
    const csvContent =
      '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rate-vn-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPortfolioJson = () => {
    if (typeof window === 'undefined' || items.length === 0) return;
    const payload = {
      source: 'Rate.vn Watchlist Portfolio',
      exportedAt: new Date().toISOString(),
      portfolioStats,
      items: items.map((item) => {
        const liveProd = productBySlug.get(item.slug);
        const liveDeal = liveDeals[item.slug];
        const rSig =
          liveDeal?.radar_signal ?? getRadarSignal(radarIndex, item.slug);
        const { currentMin: curMin, currentMax: curMax } =
          resolveWatchlistItemCurrentPrices(item, liveDeal, liveProd);
        return {
          ...item,
          currentMinPriceVnd: curMin,
          currentMaxPriceVnd: curMax,
          priceSpread10Platform: rSig?.priceSpread ?? {
            spreadVnd: Math.max(0, curMax - curMin),
            spreadPct:
              curMin > 0
                ? Math.round(((curMax - curMin) / curMin) * 1000) / 10
                : 0,
          },
          dealRadar: radarExportFields(rSig),
          targetReached: curMin > 0 && curMin <= item.targetPrice,
          bestOffer: liveDeal?.best_offer || null,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rate-vn-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container py-5">
      {/* Header Banner (DESIGN.md v3.0 Dark Obsidian Command Header) */}
      <div className="rate-scoreboard-dark rate-surface-dark p-md-5 mb-4 p-4">
        <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
          <div>
            <span className="rate-eyebrow mb-2">{t('heroBadge')}</span>
            <h1 className="h2 fw-bold mb-2 text-white">
              {t('heroTitle', { count: items.length })}
            </h1>
            <p className="text-white-50 mb-0">{t('heroSubtitle')}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCopyPortfolioMarkdown}
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  {copiedPortfolioMd
                    ? t('copiedPortfolioMdBtn')
                    : t('copyPortfolioMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPortfolioCsv}
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  {t('exportCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPortfolioJson}
                  data-testid="download-watchlist-json-btn"
                  className="btn btn-outline-light rounded-pill btn-sm fw-semibold px-3"
                >
                  {t('exportJsonBtn')}
                </button>
              </>
            )}
            <Link
              href="/inspect"
              className="btn btn-outline-light rounded-pill px-4"
            >
              {t('inspectLinkBtn')}
            </Link>
            <Link
              href="/smartphones"
              className="btn btn-outline-light rounded-pill px-4"
            >
              {t('addFromCatalogBtn')}
            </Link>
            {(() => {
              const firstCat = items[0]?.categoryPath || '/smartphones';
              const sameCatItems = items.filter(
                (x) => (x.categoryPath || '/smartphones') === firstCat
              );
              if (sameCatItems.length < 2) return null;
              const catSlug = firstCat.replace(/^\//, '') || 'smartphones';
              return (
                <Link
                  href={`/compare?cat=${catSlug}&slugs=${sameCatItems
                    .slice(0, 4)
                    .map((x) => x.slug)
                    .join(',')}`}
                  className="btn btn-danger rounded-pill fw-medium px-4"
                >
                  {t('compareSameCatBtn', {
                    count: Math.min(4, sameCatItems.length),
                  })}
                </Link>
              );
            })()}
          </div>
        </div>

        {/* Portfolio Value & Savings Summary Strip (#66) */}
        {items.length > 0 && (
          <div className="row g-3 border-top border-secondary border-opacity-25 mt-3 pt-3">
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  {t('kpiTotalMinLabel')}
                </div>
                <div className="h5 fw-bold rate-tabular mb-0 text-white">
                  {portfolioStats.totalMinVnd.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  {t('kpiTotalTargetLabel')}
                </div>
                <div className="h5 fw-bold rate-tabular text-info mb-0">
                  {portfolioStats.totalTargetVnd.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(45, 186, 105, 0.1)',
                  border: '1px solid rgba(45, 186, 105, 0.28)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  {t('kpiSpreadSavingsLabel')}
                </div>
                <div className="h5 fw-bold rate-tabular text-success mb-0">
                  +
                  {portfolioStats.totalSpreadSavingsVnd.toLocaleString('vi-VN')}{' '}
                  ₫
                </div>
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div
                className="rounded-3 h-100 p-3"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="small text-white-50 mb-1">
                  {t('kpiAvgRatingLabel')}
                </div>
                <div className="h5 fw-bold rate-tabular text-warning mb-0">
                  ★{' '}
                  {avgPortfolioRating > 0
                    ? `${avgPortfolioRating.toFixed(2)} / 5.0`
                    : t('kpiNoRating')}
                </div>
              </div>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <form
            onSubmit={handleSyncAllCloudAlerts}
            className="row g-2 align-items-center border-top border-secondary border-opacity-25 mt-3 pt-3"
          >
            <div className="col-md-8 small text-secondary">
              {t('cloudExplain')}
            </div>
            <div className="col-md-4 d-grid">
              <button
                type="submit"
                disabled={isSyncingCloud}
                className="btn btn-sm btn-danger rounded-pill fw-semibold"
              >
                {isSyncingCloud ? t('cloudSyncingBtn') : t('cloudSyncBtn')}
              </button>
            </div>
            {cloudSyncStatus && (
              <div
                role="status"
                className={`small fw-medium col-12 mt-1 ${
                  cloudSyncStatus.ok ? 'text-success' : 'text-warning'
                }`}
              >
                {cloudSyncStatus.ok ? (
                  <BsCheckCircle aria-hidden="true" className="me-1" />
                ) : (
                  <BsExclamationTriangle aria-hidden="true" className="me-1" />
                )}
                {cloudSyncStatus.message}
              </div>
            )}
          </form>
        )}

        {/* Summary KPI Strip */}
        <div className="row g-3 border-top border-secondary border-opacity-25 mt-3 pt-3">
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
              <div className="small text-white-50">
                {t('statWatchingLabel')}
              </div>
              <div className="h4 fw-bold mb-0 text-white">
                {t('statWatchingValue', { count: items.length })}
              </div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
              <div className="small text-white-50">{t('statReachedLabel')}</div>
              <div className="h4 fw-bold text-success mb-0">
                {t('statReachedValue', { count: reachedCount })}
              </div>
            </div>
          </div>
          <div className="col-sm-4 col-12">
            <div className="rounded-3 bg-opacity-10 bg-white p-3">
              <div className="small text-white-50">
                {t('statAntiFakeLabel')}
              </div>
              <div className="h4 fw-bold text-info mb-0">
                {t('statAntiFakeValue')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State with Quick Add Suggestions */}
      {items.length === 0 ? (
        <div className="card rounded-4 p-md-5 mb-4 border bg-white p-4 text-center shadow-sm">
          <div className="display-5 text-secondary mb-3">
            <BsBell aria-hidden="true" />
          </div>
          <h2 className="h5 fw-bold mb-2">{t('emptyTitle')}</h2>
          <p
            className="text-muted small mx-auto mb-4"
            style={{ maxWidth: '560px' }}
          >
            {t('emptyDescPrefix')} <strong>“{t('emptyDescBtnName')}”</strong>{' '}
            {t('emptyDescSuffix')}
          </p>

          {catalogProducts.length > 0 && (
            <div className="row g-3 justify-content-center mt-2 text-start">
              {catalogProducts.slice(0, 3).map((p) => {
                const minP = Number(p.min_price || 0);
                const thumb = productImageUrl(p) || '/img/placeholder.png';
                return (
                  <div key={p.id} className="col-lg-4 col-md-6 col-12">
                    <div className="card rounded-4 bg-light h-100 border p-3">
                      <div className="d-flex align-items-center mb-3 gap-3">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={thumb}
                          alt={p.name}
                          className="rounded border bg-white p-1"
                          style={{
                            width: '64px',
                            height: '64px',
                            objectFit: 'contain',
                          }}
                        />
                        <div>
                          <span className="badge bg-secondary-subtle text-secondary small mb-1">
                            {p.brand}
                          </span>
                          <h3 className="h6 fw-bold mb-1">{p.name}</h3>
                          <div className="text-danger fw-bold small">
                            {minP.toLocaleString('vi-VN')} ₫
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickAddCatalog(p)}
                        className="btn btn-sm btn-primary rounded-pill fw-medium w-100"
                      >
                        {t('quickWatch5PctBtn', {
                          price: computeWatchlistTargetPrice(
                            minP,
                            5
                          ).toLocaleString('vi-VN'),
                        })}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="row g-4">
          {items.map((item) => {
            const live = productBySlug.get(item.slug);
            const dealInfo = liveDeals[item.slug];
            const { currentMin, currentMax } =
              resolveWatchlistItemCurrentPrices(item, dealInfo, live);
            const diffFromAdded =
              currentMin > 0 && item.priceWhenAdded > 0
                ? currentMin - item.priceWhenAdded
                : 0;
            const diffFromTarget = currentMin - item.targetPrice;
            const targetReached =
              currentMin > 0 && currentMin <= item.targetPrice;
            // The live read names the product's own category; the stored
            // path is the last resort (#1380).
            const detailHref = live
              ? getMasterProductHref(live)
              : typeof dealInfo?.product_href === 'string' &&
                  /^\/[a-z]+\/[^/?#\s]+$/.test(dealInfo.product_href)
                ? dealInfo.product_href
                : `${item.categoryPath || '/smartphones'}/${item.slug}`;
            const bestOffer = dealInfo?.best_offer || null;
            const bestOfferSafeUrl = bestOffer
              ? sanitizeWatchlistBestOfferUrl(bestOffer.url)
              : null;
            const platformCount = sanitizeWatchlistCount(
              dealInfo?.platform_count || live?.merchant_count
            );
            const radarSignal =
              dealInfo?.radar_signal ?? getRadarSignal(radarIndex, item.slug);
            const parsedAddedTime = Date.parse(item.addedAt);
            const safeAddedDate = Number.isFinite(parsedAddedTime)
              ? new Date(parsedAddedTime).toLocaleDateString('vi-VN')
              : '-';

            return (
              <div key={item.slug} className="col-lg-6 col-12">
                <div
                  className={`card rounded-4 h-100 bg-white p-4 shadow-sm ${
                    targetReached ? 'border-success border-2' : 'border'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-start mb-3 gap-3">
                    <div className="d-flex align-items-center gap-3">
                      {item.thumbnail ? (
                        <img
                          loading="lazy"
                          decoding="async"
                          src={item.thumbnail}
                          alt={item.name}
                          className="rounded-3 bg-light border p-2"
                          style={{
                            width: '76px',
                            height: '76px',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <div
                          className="rounded-3 bg-light d-flex align-items-center justify-content-center text-muted small border"
                          style={{ width: '76px', height: '76px' }}
                        >
                          {t('noImg')}
                        </div>
                      )}
                      <div>
                        <div className="d-flex align-items-center mb-1 flex-wrap gap-2">
                          <span className="badge bg-secondary-subtle text-secondary">
                            {item.brand}
                          </span>
                          {targetReached ? (
                            <span className="badge bg-success rounded-pill text-white">
                              {t('badgeTargetReached')}
                            </span>
                          ) : (
                            <span className="badge bg-warning-subtle text-warning-emphasis border-warning-subtle rounded-pill border">
                              {t('badgeWaitingDrop', {
                                diff: Math.max(
                                  0,
                                  diffFromTarget
                                ).toLocaleString('vi-VN'),
                              })}
                            </span>
                          )}
                        </div>
                        {(radarSignal.genuineDeal ||
                          radarSignal.fakeSaleTrap ||
                          radarSignal.priceSpread) && (
                          <div
                            className="d-flex align-items-center mb-1 flex-wrap gap-1"
                            data-testid="watchlist-radar-signal"
                          >
                            {radarSignal.genuineDeal && (
                              <span className="badge bg-success-subtle text-success rounded-pill small">
                                {t('radarGenuineBadge', {
                                  pct: radarSignal.genuineDeal
                                    .savingsVsMedianPct,
                                  platform:
                                    radarSignal.genuineDeal.platform.toUpperCase(),
                                })}
                              </span>
                            )}
                            {radarSignal.fakeSaleTrap && (
                              <span className="badge bg-danger-subtle text-danger rounded-pill small">
                                {t('radarFakeBadge', {
                                  platform:
                                    radarSignal.fakeSaleTrap.platform.toUpperCase(),
                                  pct: radarSignal.fakeSaleTrap.fakeMarkupPct,
                                })}
                              </span>
                            )}
                            {radarSignal.priceSpread &&
                              radarSignal.priceSpread.spreadPct >= 3 && (
                                <span
                                  className="badge bg-warning-subtle text-dark border-warning-subtle rounded-pill small border"
                                  data-testid="watchlist-price-spread-badge"
                                >
                                  {t('radarSpreadBadge', {
                                    pct: radarSignal.priceSpread.spreadPct,
                                    vnd: radarSignal.priceSpread.spreadVnd.toLocaleString(
                                      'vi-VN'
                                    ),
                                    cheapest:
                                      radarSignal.priceSpread.cheapestPlatform.toUpperCase(),
                                    priciest:
                                      radarSignal.priceSpread.priciestPlatform.toUpperCase(),
                                  })}
                                </span>
                              )}
                          </div>
                        )}
                        <h2 className="h5 fw-bold mb-1">
                          <Link
                            href={detailHref}
                            className="text-dark text-decoration-none"
                          >
                            {item.name}
                          </Link>
                        </h2>
                        <div className="text-muted small">
                          {t('savedDateLabel', {
                            date: safeAddedDate,
                          })}
                        </div>
                      </div>
                    </div>

                    <CompareQuickToggle
                      includeWatchlist={false}
                      item={{
                        slug: item.slug,
                        name: item.name,
                        brand: item.brand,
                        thumbnail: item.thumbnail,
                        min_price: currentMin,
                      }}
                    />
                  </div>

                  {/* Price Comparison Grid */}
                  <div className="row g-2 mb-3">
                    <div className="col-sm-4 col-12">
                      <div className="rounded-3 bg-light border p-2 text-center">
                        <div className="small text-muted">
                          {t('colCurrentLowest')}
                        </div>
                        <div className="fw-bold text-danger">
                          {currentMin.toLocaleString('vi-VN')} ₫
                        </div>
                        <div
                          className="text-muted"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {currentMin !== currentMax
                            ? t('highestPriceSub', {
                                price: currentMax.toLocaleString('vi-VN'),
                              })
                            : t('sellersCountSub', {
                                count:
                                  sanitizeWatchlistCount(
                                    dealInfo?.merchant_count ||
                                      live?.merchant_count
                                  ) || 1,
                              })}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="rounded-3 bg-light border p-2 text-center">
                        <div className="small text-muted">
                          {t('colPriceWhenAdded')}
                        </div>
                        <div className="fw-semibold text-dark">
                          {item.priceWhenAdded.toLocaleString('vi-VN')} ₫
                        </div>
                        <div
                          className={
                            diffFromAdded < 0
                              ? 'text-success fw-semibold'
                              : diffFromAdded > 0
                                ? 'text-danger'
                                : 'text-muted'
                          }
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {diffFromAdded === 0
                            ? t('diffUnchanged')
                            : diffFromAdded < 0
                              ? t('diffDropped', {
                                  diff: Math.abs(diffFromAdded).toLocaleString(
                                    'vi-VN'
                                  ),
                                })
                              : t('diffIncreased', {
                                  diff: diffFromAdded.toLocaleString('vi-VN'),
                                })}
                        </div>
                      </div>
                    </div>
                    <div className="col-sm-4 col-12">
                      <div className="rounded-3 bg-primary-subtle border-primary-subtle border p-2 text-center">
                        <div className="small text-primary-emphasis">
                          {t('colTargetPrice')}
                        </div>
                        <div className="fw-bold text-primary">
                          ≤ {item.targetPrice.toLocaleString('vi-VN')} ₫
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSlug(
                              editingSlug === item.slug ? null : item.slug
                            );
                            setEditTarget(
                              sanitizeWatchlistTargetPrice(
                                item.targetPrice,
                                currentMin || item.priceWhenAdded
                              )
                            );
                          }}
                          className="btn btn-link btn-sm text-decoration-none p-0"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {t('editTargetBtn')}
                        </button>
                      </div>
                    </div>
                  </div>

                  {(dealInfo?.size_required ||
                    sizePicker?.slug === item.slug) && (
                    <div
                      className="rounded-3 bg-warning-subtle border-warning-subtle mb-3 border px-3 py-2"
                      data-testid="watchlist-size-required"
                    >
                      <div
                        className="small fw-semibold mb-1"
                        id={`size-required-${item.slug}`}
                      >
                        {t('sizeRequiredTitle')}
                      </div>
                      {sizePickerFailed === item.slug && (
                        <div className="small mb-1">
                          {t('sizeRequiredUnavailable')}{' '}
                          <Link href={detailHref}>
                            {t('sizeRequiredProductLink')}
                          </Link>
                        </div>
                      )}
                      {sizePicker?.slug === item.slug ? (
                        <div
                          className="d-flex flex-wrap gap-2"
                          role="group"
                          aria-labelledby={`size-required-${item.slug}`}
                        >
                          {sizePicker.choices.map((choice) => (
                            <button
                              key={choice.slug}
                              type="button"
                              className="btn btn-outline-primary btn-sm rounded-pill"
                              onClick={() => void chooseSize(item, choice)}
                            >
                              {choice.label}
                              {choice.minPrice > 0 &&
                                ` · ${choice.minPrice.toLocaleString('vi-VN')} ₫`}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm rounded-pill"
                          onClick={() => openSizePicker(item.slug)}
                        >
                          {t('sizeRequiredCta')}
                        </button>
                      )}
                    </div>
                  )}

                  {bestOffer && (
                    <div
                      className={`rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 border px-3 py-2 ${
                        targetReached
                          ? 'bg-success-subtle border-success-subtle text-success-emphasis'
                          : 'bg-light text-dark'
                      }`}
                    >
                      <div className="small">
                        <span className="fw-semibold">
                          {t('bestOfferPrefix', { count: platformCount })}
                        </span>{' '}
                        <span className="badge bg-dark rounded-pill me-1 text-white">
                          {PLATFORM_DISPLAY_LABELS[bestOffer.platform] ||
                            bestOffer.platform.toUpperCase()}
                        </span>
                        <span className="fw-medium">
                          <ContentText
                            text={bestOffer.merchant_name}
                            locale={locale || 'vi'}
                          />
                        </span>{' '}
                        {bestOffer.is_official_mall && (
                          <span className="badge bg-success-subtle text-success border-success-subtle border">
                            {t('officialMallBadge')}
                          </span>
                        )}
                      </div>
                      {bestOfferSafeUrl && (
                        <a
                          href={bestOfferSafeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="small fw-semibold text-primary text-decoration-none"
                        >
                          {t('openDealLink', {
                            price: (
                              sanitizeWatchlistPrice(bestOffer.price) ||
                              currentMin
                            ).toLocaleString('vi-VN'),
                          })}
                        </a>
                      )}
                    </div>
                  )}

                  {editingSlug === item.slug && (
                    <div className="rounded-3 bg-light d-flex align-items-center mb-3 gap-2 border p-3">
                      <input
                        type="number"
                        step={
                          currentMin > 0 && currentMin < 2_000_000
                            ? 10000
                            : 100000
                        }
                        min={MIN_WATCHLIST_TARGET_PRICE}
                        value={editTarget}
                        onChange={(e) =>
                          setEditTarget(Number(e.target.value || 0))
                        }
                        className="form-control form-control-sm fw-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateTarget(item)}
                        className="btn btn-sm btn-primary rounded-pill px-3"
                      >
                        {t('saveBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSlug(null)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2"
                      >
                        {t('cancelBtn')}
                      </button>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center border-top mt-auto flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => removeWatchlistItem(item.slug)}
                      className="btn btn-sm btn-outline-danger rounded-pill px-3"
                    >
                      {t('removeFromWatchlistBtn')}
                    </button>
                    <div className="d-flex gap-2">
                      <Link
                        href={`${detailHref}#price-history-section`}
                        className="btn btn-sm btn-outline-primary rounded-pill px-3"
                      >
                        {t('priceChartLink')}
                      </Link>
                      <Link
                        href={detailHref}
                        className="btn btn-sm btn-primary rounded-pill fw-medium px-3"
                      >
                        {t('viewBestSellersLink')}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
