'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsLightningCharge } from 'react-icons/bs';
import { useRouter } from '@/lib/navigation';
import { startNavigationProgress } from '@/components/elementary/NavigationProgress';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  type CanonicalCategorySlug,
  type MasterProduct,
} from '@/lib/rate-domain';
import { versusHref } from '@/lib/item-compare';
import { catalogRowSlug, type ItemCatalogRow } from '@/lib/item-directory';

export function sanitizeVersusPeerPriceVnd(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  let num: number;
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return 0;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return 0;
    }
    num = Number(trimmed);
  } else {
    num = value;
  }
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  const rounded = Math.round(num);
  return rounded > 0 && rounded <= MAX_VALID_VND_PRICE ? rounded : 0;
}

export function formatVersusPeerPriceBadge(value: unknown): string {
  const num = sanitizeVersusPeerPriceVnd(value);
  if (num <= 0) {
    return 'N/A';
  }
  if (num >= 1_000_000) {
    return `${Math.max(1, Math.round(num / 1_000_000))}M`;
  }
  return `${Math.max(1, Math.round(num / 1_000))}K`;
}

export function buildVersusPeerItemSlugMap(
  peers: readonly ItemCatalogRow[],
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): Record<string, string> {
  const map: Record<string, string> = {};
  if (itemSlugBySlug) {
    for (const [slug, itemSlug] of Object.entries(itemSlugBySlug)) {
      if (slug && typeof itemSlug === 'string' && itemSlug) {
        map[slug] = itemSlug;
      }
    }
  }
  for (const peer of peers) {
    if (!peer || typeof peer.slug !== 'string' || !peer.slug) continue;
    const rowSlug = catalogRowSlug(peer);
    if (rowSlug && rowSlug !== peer.slug && !map[peer.slug]) {
      map[peer.slug] = rowSlug;
    }
  }
  return map;
}

export function resolveVersusPeerSideSlug(
  slug: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  if (!slug) return '';
  const mapped = itemSlugBySlug?.[slug];
  return mapped && !mapped.includes('-vs-') ? mapped : slug;
}

export function isSameVersusPeerItem(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): boolean {
  if (!slugA || !slugB) return false;
  if (slugA.toLowerCase() === slugB.toLowerCase()) return true;
  const sideA = resolveVersusPeerSideSlug(slugA, itemSlugBySlug);
  const sideB = resolveVersusPeerSideSlug(slugB, itemSlugBySlug);
  if (sideA.toLowerCase() === sideB.toLowerCase()) return true;
  const rawItemA = itemSlugBySlug?.[slugA];
  const rawItemB = itemSlugBySlug?.[slugB];
  return Boolean(
    rawItemA && rawItemB && rawItemA.toLowerCase() === rawItemB.toLowerCase()
  );
}

export function resolveEffectivePeerSlugs(
  peers: readonly ItemCatalogRow[],
  requestedSlugA: string,
  requestedSlugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): { effectiveSlugA: string; effectiveSlugB: string } {
  const mergedMap = buildVersusPeerItemSlugMap(peers, itemSlugBySlug);
  const validSlugs = new Set(peers.map((p) => p.slug).filter(Boolean));
  const effectiveSlugA = validSlugs.has(requestedSlugA)
    ? requestedSlugA
    : (peers[0]?.slug ?? '');
  const effectiveSlugB =
    validSlugs.has(requestedSlugB) &&
    !isSameVersusPeerItem(requestedSlugB, effectiveSlugA, mergedMap)
      ? requestedSlugB
      : (peers.find(
          (p) =>
            p.slug && !isSameVersusPeerItem(p.slug, effectiveSlugA, mergedMap)
        )?.slug ?? '');
  return { effectiveSlugA, effectiveSlugB };
}

interface VersusMatchupSwitcherProps {
  readonly currentSlugA: string;
  readonly currentSlugB: string;
  readonly categorySlug: CanonicalCategorySlug;
  readonly catalogCandidates: MasterProduct[];
  readonly locale?: string;
  /** RATE_ITEM_MODEL on: variant slug to Item slug, for versus links. */
  readonly itemSlugBySlug?: Readonly<Record<string, string>>;
}

export default function VersusMatchupSwitcher({
  currentSlugA,
  currentSlugB,
  categorySlug,
  catalogCandidates,
  itemSlugBySlug,
}: VersusMatchupSwitcherProps) {
  const t = useTranslations('compare');
  const router = useRouter();
  const [slugA, setSlugA] = useState<string>(currentSlugA);
  const [slugB, setSlugB] = useState<string>(currentSlugB);

  const sameCategoryPeers = useMemo(() => {
    if (!Array.isArray(catalogCandidates)) return [];
    return catalogCandidates.filter(
      (p) => p && getMasterProductCategorySlug(p) === categorySlug
    );
  }, [catalogCandidates, categorySlug]);

  const resolvedItemSlugBySlug = useMemo(
    () => buildVersusPeerItemSlugMap(sameCategoryPeers, itemSlugBySlug),
    [sameCategoryPeers, itemSlugBySlug]
  );

  const { effectiveSlugA, effectiveSlugB } = useMemo(
    () =>
      resolveEffectivePeerSlugs(
        sameCategoryPeers,
        slugA,
        slugB,
        resolvedItemSlugBySlug
      ),
    [sameCategoryPeers, slugA, slugB, resolvedItemSlugBySlug]
  );

  const canLaunchMatchup = Boolean(
    effectiveSlugA &&
    effectiveSlugB &&
    !isSameVersusPeerItem(
      effectiveSlugA,
      effectiveSlugB,
      resolvedItemSlugBySlug
    )
  );
  const targetHref = canLaunchMatchup
    ? versusHref(effectiveSlugA, effectiveSlugB, resolvedItemSlugBySlug)
    : '';
  const currentHref =
    currentSlugA && currentSlugB
      ? versusHref(currentSlugA, currentSlugB, resolvedItemSlugBySlug)
      : '';
  const isDifferentFromCurrent = Boolean(
    targetHref && targetHref !== currentHref
  );

  const handleLaunchMatchup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLaunchMatchup || !targetHref) return;
    startNavigationProgress(targetHref);
    router.push(targetHref);
  };

  if (sameCategoryPeers.length < 2 || !effectiveSlugA || !effectiveSlugB) {
    return null;
  }

  return (
    <form
      onSubmit={handleLaunchMatchup}
      className="rounded-4 mt-3 p-3"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="small fw-semibold text-white">
          <BsLightningCharge aria-hidden="true" className="me-1" />
          {t('switcherTitle')}
        </div>
        <span className="small text-white-50">
          {t('switcherPeerCount', { count: sameCategoryPeers.length })}{' '}
          <code className="text-info">{categorySlug}</code>
        </span>
      </div>

      <div className="row g-2 align-items-center">
        <div className="col-lg-5 col-md-6">
          <select
            aria-label={t('selectDeviceAAria')}
            value={effectiveSlugA}
            onChange={(e) => setSlugA(e.target.value)}
            className="form-select form-select-sm"
          >
            {sameCategoryPeers.map((peer) => (
              <option
                key={`a-${peer.slug}`}
                value={peer.slug}
                disabled={isSameVersusPeerItem(
                  peer.slug,
                  effectiveSlugB,
                  resolvedItemSlugBySlug
                )}
              >
                [A] {peer.name} ({formatVersusPeerPriceBadge(peer.min_price)})
              </option>
            ))}
          </select>
        </div>

        <div className="col-lg-5 col-md-6">
          <select
            aria-label={t('selectDeviceBAria')}
            value={effectiveSlugB}
            onChange={(e) => setSlugB(e.target.value)}
            className="form-select form-select-sm"
          >
            {sameCategoryPeers.map((peer) => (
              <option
                key={`b-${peer.slug}`}
                value={peer.slug}
                disabled={isSameVersusPeerItem(
                  peer.slug,
                  effectiveSlugA,
                  resolvedItemSlugBySlug
                )}
              >
                [B] {peer.name} ({formatVersusPeerPriceBadge(peer.min_price)})
              </option>
            ))}
          </select>
        </div>

        <div className="col-lg-2 d-grid col-12">
          <button
            type="submit"
            disabled={!canLaunchMatchup || !isDifferentFromCurrent}
            className="btn btn-sm btn-danger rounded-pill fw-semibold"
          >
            {t('launch1v1Btn')}
          </button>
        </div>
      </div>
    </form>
  );
}
