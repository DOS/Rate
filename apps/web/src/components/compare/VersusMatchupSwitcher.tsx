'use client';

import React, { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsLightningCharge } from 'react-icons/bs';
import { useRouter } from '@/lib/navigation';
import { startNavigationProgress } from '@/components/elementary/NavigationProgress';
import {
  getMasterProductCategorySlug,
  type CanonicalCategorySlug,
  type MasterProduct,
} from '@/lib/rate-domain';

interface VersusMatchupSwitcherProps {
  readonly currentSlugA: string;
  readonly currentSlugB: string;
  readonly categorySlug: CanonicalCategorySlug;
  readonly catalogCandidates: MasterProduct[];
  readonly locale?: string;
}

export default function VersusMatchupSwitcher({
  currentSlugA,
  currentSlugB,
  categorySlug,
  catalogCandidates,
}: VersusMatchupSwitcherProps) {
  const t = useTranslations('compare');
  const router = useRouter();
  const [slugA, setSlugA] = useState<string>(currentSlugA);
  const [slugB, setSlugB] = useState<string>(currentSlugB);

  const sameCategoryPeers = useMemo(() => {
    return catalogCandidates.filter(
      (p) => getMasterProductCategorySlug(p) === categorySlug
    );
  }, [catalogCandidates, categorySlug]);

  const canLaunchMatchup = Boolean(slugA && slugB && slugA !== slugB);
  const isDifferentFromCurrent =
    slugA !== currentSlugA || slugB !== currentSlugB;

  const handleLaunchMatchup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLaunchMatchup) return;
    startNavigationProgress(`/compare/${slugA}-vs-${slugB}`);
    router.push(`/compare/${slugA}-vs-${slugB}`);
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
            value={slugA}
            onChange={(e) => setSlugA(e.target.value)}
            className="form-select form-select-sm bg-dark border-secondary text-white"
          >
            {sameCategoryPeers.map((peer) => (
              <option
                key={`a-${peer.slug}`}
                value={peer.slug}
                disabled={peer.slug === slugB}
              >
                [A] {peer.name} (
                {Number(peer.min_price || 0) > 0
                  ? `${Math.round(Number(peer.min_price) / 1000000)}M`
                  : 'N/A'}
                )
              </option>
            ))}
          </select>
        </div>

        <div className="col-lg-5 col-md-6">
          <select
            aria-label={t('selectDeviceBAria')}
            value={slugB}
            onChange={(e) => setSlugB(e.target.value)}
            className="form-select form-select-sm bg-dark border-secondary text-white"
          >
            {sameCategoryPeers.map((peer) => (
              <option
                key={`b-${peer.slug}`}
                value={peer.slug}
                disabled={peer.slug === slugA}
              >
                [B] {peer.name} (
                {Number(peer.min_price || 0) > 0
                  ? `${Math.round(Number(peer.min_price) / 1000000)}M`
                  : 'N/A'}
                )
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
