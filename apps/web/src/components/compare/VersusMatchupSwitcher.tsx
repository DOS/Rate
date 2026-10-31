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

export function formatVersusPeerPriceBadge(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 'N/A';
  }
  if (num >= 1_000_000) {
    return `${Math.max(1, Math.round(num / 1_000_000))}M`;
  }
  return `${Math.max(1, Math.round(num / 1_000))}K`;
}

export function resolveEffectivePeerSlugs(
  peers: readonly MasterProduct[],
  requestedSlugA: string,
  requestedSlugB: string
): { effectiveSlugA: string; effectiveSlugB: string } {
  const validSlugs = new Set(peers.map((p) => p.slug).filter(Boolean));
  const effectiveSlugA = validSlugs.has(requestedSlugA)
    ? requestedSlugA
    : (peers[0]?.slug ?? '');
  const effectiveSlugB =
    validSlugs.has(requestedSlugB) && requestedSlugB !== effectiveSlugA
      ? requestedSlugB
      : (peers.find((p) => p.slug && p.slug !== effectiveSlugA)?.slug ?? '');
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

  const { effectiveSlugA, effectiveSlugB } = useMemo(
    () => resolveEffectivePeerSlugs(sameCategoryPeers, slugA, slugB),
    [sameCategoryPeers, slugA, slugB]
  );

  const canLaunchMatchup = Boolean(
    effectiveSlugA && effectiveSlugB && effectiveSlugA !== effectiveSlugB
  );
  const isDifferentFromCurrent =
    effectiveSlugA !== currentSlugA || effectiveSlugB !== currentSlugB;

  const handleLaunchMatchup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLaunchMatchup) return;
    const href = versusHref(effectiveSlugA, effectiveSlugB, itemSlugBySlug);
    startNavigationProgress(href);
    router.push(href);
  };

  if (sameCategoryPeers.length < 2) {
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
                disabled={peer.slug === effectiveSlugB}
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
                disabled={peer.slug === effectiveSlugA}
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
