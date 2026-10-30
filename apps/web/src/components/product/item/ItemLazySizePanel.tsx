'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsShieldCheck } from 'react-icons/bs';
import PriceHistorySection from '@/components/price-history/PriceHistorySection';
import ProductOffersExplorer from '@/components/leaderboard/ProductOffersExplorer';
import ProductShareAuditButton from '@/components/leaderboard/ProductShareAuditButton';
import PriceWatchButton from '@/components/watchlist/PriceWatchButton';
import {
  itemSizePanelPath,
  type ItemSizePanelData,
  type ItemSizeStripContext,
} from '@/lib/item-size-panel';
import { useSelectedVariant } from './selected-variant';
import { formatNumber, formatPriceVnd } from '@/lib/locale-format';

export type ItemSizePanelKind = 'strip' | 'history' | 'offers';

// The request in flight per size, shared by the size's three panels. It is
// dropped once settled, so a later pick reads fresh data (the route itself is
// cached for 5 minutes).
const inFlight = new Map<string, Promise<ItemSizePanelData>>();

function loadSize(slug: string): Promise<ItemSizePanelData> {
  let load = inFlight.get(slug);
  if (!load) {
    load = fetch(itemSizePanelPath(slug))
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((json: { ok?: boolean; data?: ItemSizePanelData }) =>
        json?.ok && json.data ? json.data : Promise.reject('no data')
      );
    const settle = () => inFlight.delete(slug);
    load.then(settle, settle);
    inFlight.set(slug, load);
  }
  return load;
}

function useSizePanel(
  slug: string | undefined,
  attempt: number
): {
  data: ItemSizePanelData | null;
  failed: boolean;
} {
  const [state, setState] = useState<{
    slug?: string;
    data: ItemSizePanelData | null;
    failed: boolean;
  }>({ data: null, failed: false });
  useEffect(() => {
    if (!slug) return;
    let live = true;
    loadSize(slug).then(
      (data) => live && setState({ slug, data, failed: false }),
      () => live && setState({ slug, data: null, failed: true })
    );
    return () => {
      live = false;
    };
  }, [slug, attempt]);
  return state.slug === slug
    ? { data: state.data, failed: state.failed }
    : { data: null, failed: false };
}

/** The price strip of one size, as the server renders it on the variant page. */
export function ItemSizePriceStrip({
  data,
  context,
}: {
  data: ItemSizePanelData;
  context: ItemSizeStripContext;
}) {
  const t = useTranslations('productDetail');
  const tSale = useTranslations('saleState');
  const locale = useLocale();
  const { stats, priceHistory, product } = data;
  return (
    <div className="rounded-4 bg-light mb-2 border p-3">
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-2">
        <div>
          <div className="text-muted small">
            {t('priceReferenceLabel', { count: stats.sellerCount })}
          </div>
          <div className="fw-bold text-dark rate-tabular fs-5">
            {stats.minPrice > 0 ? (
              formatPriceVnd(stats.minPrice, locale)
            ) : data.saleStateKey ? (
              <span data-sale-state={data.saleState}>
                {tSale(data.saleStateKey)}
              </span>
            ) : (
              t('priceNoneInStock')
            )}
            {stats.minPrice > 0 && stats.minPrice !== stats.maxPrice && (
              <span className="small fw-normal text-muted ms-2">
                ~ {formatPriceVnd(stats.maxPrice, locale)}
              </span>
            )}
            {priceHistory.lowestEverPrice != null && (
              <span className="badge bg-success-subtle text-success fw-normal ms-2">
                {t('allTimeLowBadge', {
                  price: formatNumber(priceHistory.lowestEverPrice, locale),
                })}
              </span>
            )}
          </div>
        </div>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <PriceWatchButton
            slug={product.slug}
            name={product.name}
            brand={product.brand}
            categoryPath={context.categoryPath}
            thumbnail={product.image}
            currentMinPrice={stats.minPrice}
            size="sm"
          />
          <a
            href="#price-history-section"
            className="btn btn-sm btn-outline-secondary rounded-pill px-3"
          >
            {t('auditPriceBtn', { count: data.offers.length })}
          </a>
          <ProductShareAuditButton
            name={product.name}
            brand={product.brand}
            modelKey={product.model_key}
            userScore5={context.userScore5}
            expertScore10={context.expertScore10}
            authenticReviews={context.authenticReviews}
            minPriceVnd={stats.minPrice}
            offerCount={stats.sellerCount}
            keySpecLine={context.keySpecLine}
            radarSignal={data.radarSignal}
          />
        </div>
      </div>
    </div>
  );
}

/** The offer table of one size, as the server renders it on the variant page. */
export function ItemSizeOffers({ data }: { data: ItemSizePanelData }) {
  const t = useTranslations('productDetail');
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <span className="rate-eyebrow text-muted d-block mb-1">
            {t('offersEyebrow')}
          </span>
          <h2 className="h4 fw-bold d-flex align-items-center mb-0 gap-2">
            <BsShieldCheck aria-hidden="true" />{' '}
            {t('offersTitle', { count: data.offers.length })}
          </h2>
        </div>
        <span className="badge bg-light text-secondary rounded-pill border px-3 py-2">
          {t('offersMedianBadge')}
        </span>
      </div>
      {data.offers.length === 0 ? (
        <p className="text-muted mb-0">{t('noOffersYet')}</p>
      ) : (
        <ProductOffersExplorer
          productName={data.product.name}
          productSlug={data.product.slug}
          offers={data.offers}
          byOffer={data.priceHistory.byOffer}
          radarSignal={data.radarSignal}
        />
      )}
    </>
  );
}

function renderSize(
  kind: ItemSizePanelKind,
  data: ItemSizePanelData,
  context: ItemSizeStripContext
): ReactNode {
  if (kind === 'strip')
    return <ItemSizePriceStrip data={data} context={context} />;
  if (kind === 'offers') return <ItemSizeOffers data={data} />;
  return (
    <PriceHistorySection
      productName={data.product.name}
      // Its "current lowest" is the size's "from" price (DOS/Rate#1141).
      history={{
        ...data.priceHistory,
        currentMinPrice: data.stats.minPrice > 0 ? data.stats.minPrice : null,
      }}
      radarSignal={data.radarSignal}
    />
  );
}

/**
 * One panel slot of an Item with many sizes (DOS/Rate#1285): the default size
 * comes server-rendered; another size is loaded when it is picked and shown
 * with the same components. Keyed per size, so no panel state carries over.
 */
export default function ItemLazySizePanel({
  kind,
  defaultKey,
  defaultNode,
  slugs,
  context,
}: {
  kind: ItemSizePanelKind;
  defaultKey: string;
  defaultNode: ReactNode;
  /** variant_key to variant slug, every size of the Item. */
  slugs: Record<string, string>;
  context: ItemSizeStripContext;
}) {
  const t = useTranslations('productDetail');
  const selected = useSelectedVariant(Object.keys(slugs), defaultKey);
  const lazy = selected !== defaultKey;
  const [attempt, setAttempt] = useState(0);
  const { data, failed } = useSizePanel(
    lazy ? slugs[selected] : undefined,
    attempt
  );
  if (!lazy) return <Fragment key={defaultKey}>{defaultNode}</Fragment>;
  if (data) {
    return (
      <Fragment key={selected}>{renderSize(kind, data, context)}</Fragment>
    );
  }
  return (
    <div
      key={selected}
      className={kind === 'strip' ? 'mb-2' : 'py-4'}
      aria-busy={!failed}
      role={failed ? 'alert' : undefined}
    >
      <p className="text-muted small mb-0">
        {failed ? t('sizePanelLoadFailed') : t('sizePanelLoading')}
        {failed && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 ms-2 align-baseline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('sizePanelRetry')}
          </button>
        )}
      </p>
    </div>
  );
}
