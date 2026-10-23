'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IconType } from 'react-icons';
import {
  BsAspectRatio,
  BsBatteryHalf,
  BsCalendar3,
  BsCamera,
  BsCpu,
  BsGlobe,
  BsPhone,
  BsReception4,
  BsSearch,
  BsShieldCheck,
  BsStar,
  BsVolumeUp,
} from 'react-icons/bs';
import { Link, useRouter } from '@/lib/navigation';
import type {
  KeySpecs,
  MasterProduct,
  ProductSpecifications,
} from '@repo/shared-data';
import {
  type CanonicalCategorySlug,
  buildPopular1v1BattlesForCategory,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveCompareBatteryMah,
  resolveCompareDisplaySizeInch,
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating5,
  resolveCompareMemoryScore,
  resolveCompareRamGb,
  resolveCompareStorageGb,
  resolveProductImageUrl,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  getCompareTray,
  MAX_COMPARE_ITEMS,
  setCompareTray,
} from './compare-tray';
import { upsertWatchlistItem } from '@/components/watchlist/watchlist-store';
import { getSpecUiDictionary, localizeSpecValue } from '@/lib/spec-localizer';
import ContentText from '@/components/elementary/ContentText';

interface CompareWorkspaceProps {
  initialProducts: MasterProduct[];
  catalogCandidates: MasterProduct[];
  initialCategory?: CanonicalCategorySlug;
  hasExplicitSlugs?: boolean;
  locale?: string;
}

type CompareTranslator = ReturnType<typeof useTranslations<'compare'>>;

interface SpecRowDef {
  id: string;
  label: string;
  renderValue: (p: MasterProduct) => string;
  numericValue?: (p: MasterProduct) => number | null;
  higherIsBetter?: boolean;
}

interface SpecGroupDef {
  id: string;
  title: string;
  icon: IconType;
  rows: SpecRowDef[];
}

function formatBool(
  val: boolean | string | undefined | null,
  t: CompareTranslator
): string {
  if (typeof val === 'string' && val.trim()) return val;
  if (val === true) return t('boolYes');
  if (val === false) return t('boolNo');
  return '-';
}

function getEffectiveRating(p: MasterProduct): number {
  return resolveCompareEffectiveUserRating(p);
}

function buildCategoryTabs(t: CompareTranslator): Array<{
  slug: CanonicalCategorySlug;
  label: string;
  unitLabel: string;
}> {
  return [
    {
      slug: 'smartphones',
      label: t('catSmartphones'),
      unitLabel: t('catSmartphonesUnit'),
    },
    {
      slug: 'tablets',
      label: t('catTablets'),
      unitLabel: t('catTabletsUnit'),
    },
    {
      slug: 'laptops',
      label: t('catLaptops'),
      unitLabel: t('catLaptopsUnit'),
    },
    {
      slug: 'smartwatches',
      label: t('catSmartwatches'),
      unitLabel: t('catSmartwatchesUnit'),
    },
    {
      slug: 'earbuds',
      label: t('catEarbuds'),
      unitLabel: t('catEarbudsUnit'),
    },
  ];
}

function buildSpecGroups(t: CompareTranslator): SpecGroupDef[] {
  return [
    {
      id: 'market_trust',
      title: t('group0Title'),
      icon: BsStar,
      rows: [
        {
          id: 'rating_weighted',
          label: t('rowRatingWeighted'),
          renderValue: (p) => {
            const r = getEffectiveRating(p);
            const count = p.authentic_review_count || p.total_reviews || 0;
            return r > 0
              ? t('valAuthenticReviews', { rating: r.toFixed(1), count })
              : t('valNoReviews');
          },
          numericValue: (p) => {
            const r = getEffectiveRating(p);
            return r > 0 ? r : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'expert_rating',
          label: t('rowExpertRating'),
          renderValue: (p) => {
            const exp5 = resolveCompareExpertRating5(p);
            return exp5 != null ? `Lab ${exp5.toFixed(1)} / 5.0` : '-';
          },
          numericValue: (p) => resolveCompareExpertRating5(p),
          higherIsBetter: true,
        },
        {
          id: 'min_price',
          label: t('rowMinPrice'),
          renderValue: (p) =>
            Number(p.min_price) > 0
              ? `${Number(p.min_price).toLocaleString('vi-VN')} ₫`
              : '-',
          numericValue: (p) =>
            Number(p.min_price) > 0 ? Number(p.min_price) : null,
          higherIsBetter: false,
        },
        {
          id: 'price_range',
          label: t('rowPriceRange'),
          renderValue: (p) => {
            const min = Number(p.min_price || 0);
            const max = Number(p.max_price || 0);
            if (min <= 0) return '-';
            if (max > min) {
              return `${min.toLocaleString('vi-VN')} ₫ - ${max.toLocaleString('vi-VN')} ₫`;
            }
            return `${min.toLocaleString('vi-VN')} ₫`;
          },
        },
        {
          id: 'merchant_count',
          label: t('rowMerchantCount'),
          renderValue: (p) =>
            t('valSourcesCount', { count: p.merchant_count || 0 }),
          numericValue: (p) => Number(p.merchant_count || 0),
          higherIsBetter: true,
        },
        {
          id: 'value_per_point',
          label: t('rowValuePerPoint'),
          renderValue: (p) => {
            const min = Number(p.min_price || 0);
            if (min <= 0) return '-';
            const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
            const exp5 = resolveCompareExpertRating5(p);
            const e = exp5 != null ? exp5 * 2 : null;
            const combined10 =
              u != null && e != null
                ? u * 2 * 0.6 + e * 0.4
                : u != null
                  ? u * 2
                  : (e ?? 0);
            if (combined10 <= 0) return '-';
            const costPerPt = Math.round(min / combined10);
            return t('valPerPoint', {
              cost: costPerPt.toLocaleString('vi-VN'),
            });
          },
          numericValue: (p) => {
            const min = Number(p.min_price || 0);
            if (min <= 0) return null;
            const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
            const exp5 = resolveCompareExpertRating5(p);
            const e = exp5 != null ? exp5 * 2 : null;
            const combined10 =
              u != null && e != null
                ? u * 2 * 0.6 + e * 0.4
                : u != null
                  ? u * 2
                  : (e ?? 0);
            return combined10 > 0 ? Math.round(min / combined10) : null;
          },
          higherIsBetter: false,
        },
        {
          id: 'daily_cost_2y',
          label: t('rowDailyCost2y'),
          renderValue: (p) => {
            const min = Number(p.min_price || 0);
            if (min <= 0) return '-';
            const daily = Math.round(min / 730);
            return t('valPerDay', { cost: daily.toLocaleString('vi-VN') });
          },
          numericValue: (p) => {
            const min = Number(p.min_price || 0);
            return min > 0 ? Math.round(min / 730) : null;
          },
          higherIsBetter: false,
        },
      ],
    },
    {
      id: 'display',
      title: '1. Display',
      icon: BsPhone,
      rows: [
        {
          id: 'display_size',
          label: t('rowDisplaySize'),
          renderValue: (p) => {
            const size = resolveCompareDisplaySizeInch(p);
            return size != null ? `${size}"` : '-';
          },
          numericValue: (p) => resolveCompareDisplaySizeInch(p),
          higherIsBetter: true,
        },
        {
          id: 'display_type',
          label: t('rowDisplayType'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specs.display?.type || keySpecs.screen || '-';
          },
        },
        {
          id: 'display_resolution',
          label: t('rowDisplayResolution'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const res = specs.display?.resolution || '-';
            const ppi = specs.display?.ppi ? ` (${specs.display.ppi} ppi)` : '';
            return res === '-' && !ppi ? '-' : `${res}${ppi}`;
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.ppi ? Number(specs.display.ppi) : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'display_refresh',
          label: t('rowDisplayRefresh'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.refresh_rate_hz
              ? `${specs.display.refresh_rate_hz} Hz`
              : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.display?.refresh_rate_hz
              ? Number(specs.display.refresh_rate_hz)
              : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'display_protection',
          label: t('rowDisplayProtection'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.display?.protection,
              specs.display?.features,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'hardware',
      title: '2. Hardware',
      icon: BsCpu,
      rows: [
        {
          id: 'hw_chipset',
          label: t('rowHwChipset'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specs.hardware?.chipset || keySpecs.chip || '-';
          },
        },
        {
          id: 'hw_cpu_gpu',
          label: t('rowHwCpuGpu'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [specs.hardware?.cpu, specs.hardware?.gpu].filter(
              Boolean
            );
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
        {
          id: 'hw_ram',
          label: t('rowHwRam'),
          renderValue: (p) => {
            const ram = resolveCompareRamGb(p);
            return ram != null ? `${ram} GB` : '-';
          },
          numericValue: (p) => resolveCompareRamGb(p),
          higherIsBetter: true,
        },
        {
          id: 'hw_storage',
          label: t('rowHwStorage'),
          renderValue: (p) => {
            const rom = resolveCompareStorageGb(p);
            if (!rom) return '-';
            return rom >= 1024 ? `${rom / 1024} TB` : `${rom} GB`;
          },
          numericValue: (p) => resolveCompareStorageGb(p),
          higherIsBetter: true,
        },
        {
          id: 'hw_os_exp',
          label: t('rowHwOsExp'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.hardware?.os,
              specs.hardware?.storage_expansion
                ? t('valCardSlotPrefix', {
                    value: specs.hardware.storage_expansion,
                  })
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'camera',
      title: '3. Camera',
      icon: BsCamera,
      rows: [
        {
          id: 'cam_main',
          label: t('rowCamMain'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const keySpecs = (p.key_specs || {}) as KeySpecs;
            return specs.camera?.main_camera || keySpecs.camera || '-';
          },
        },
        {
          id: 'cam_second',
          label: t('rowCamSecond'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.camera?.second_camera || '-';
          },
        },
        {
          id: 'cam_third_fourth',
          label: t('rowCamThirdFourth'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.camera?.third_camera,
              specs.camera?.fourth_camera,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' + ') : '-';
          },
        },
        {
          id: 'cam_video',
          label: t('rowCamVideo'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.camera?.video_recording,
              specs.camera?.flash,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
        {
          id: 'cam_front',
          label: t('rowCamFront'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.camera?.front_camera || '-';
          },
        },
      ],
    },
    {
      id: 'battery',
      title: '4. Battery',
      icon: BsBatteryHalf,
      rows: [
        {
          id: 'bat_capacity',
          label: t('rowBatCapacity'),
          renderValue: (p) => {
            const mah = resolveCompareBatteryMah(p);
            return mah != null ? `${mah} mAh` : '-';
          },
          numericValue: (p) => resolveCompareBatteryMah(p),
          higherIsBetter: true,
        },
        {
          id: 'bat_fast_charge',
          label: t('rowBatFastCharge'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.battery?.fast_charging_w
              ? `${specs.battery.fast_charging_w} W`
              : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.battery?.fast_charging_w
              ? Number(specs.battery.fast_charging_w)
              : null;
          },
          higherIsBetter: true,
        },
        {
          id: 'bat_details',
          label: t('rowBatDetails'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.battery?.type,
              specs.battery?.charging,
              specs.battery?.reverse_charging
                ? t('valReverseChargePrefix', {
                    value: formatBool(specs.battery.reverse_charging, t),
                  })
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'design',
      title: '5. Design',
      icon: BsAspectRatio,
      rows: [
        {
          id: 'design_dim',
          label: t('rowDesignDim'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.dimensions || '-';
          },
        },
        {
          id: 'design_weight',
          label: t('rowDesignWeight'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.weight_g ? `${specs.design.weight_g} g` : '-';
          },
          numericValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.weight_g
              ? Number(specs.design.weight_g)
              : null;
          },
          higherIsBetter: false,
        },
        {
          id: 'design_materials',
          label: t('rowDesignMaterials'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.materials || specs.design?.build || '-';
          },
        },
        {
          id: 'design_resistance',
          label: t('rowDesignResistance'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.design?.resistance || '-';
          },
        },
        {
          id: 'design_bio_colors',
          label: t('rowDesignBioColors'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const colors =
              specs.design?.colors && specs.design.colors.length > 0
                ? specs.design.colors.join(', ')
                : p.colors && p.colors.length > 0
                  ? p.colors.join(', ')
                  : null;
            const parts = [
              specs.design?.biometrics,
              colors ? t('valColorsPrefix', { value: colors }) : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'cellular',
      title: '6. Cellular',
      icon: BsReception4,
      rows: [
        {
          id: 'cell_5g',
          label: t('rowCell5g'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const has5g = specs.cellular?.has_5g ?? p.has_5g;
            return has5g ? t('valHas5g') : t('val4gLte');
          },
        },
        {
          id: 'cell_sim',
          label: t('rowCellSim'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.cellular?.sim_type,
              specs.cellular?.technology,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
        {
          id: 'cell_bands',
          label: t('rowCellBands'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.cellular?.bands_5g,
              specs.cellular?.data_speed,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'connectivity',
      title: '7. Connectivity',
      icon: BsGlobe,
      rows: [
        {
          id: 'conn_wlan_bt',
          label: t('rowConnWlanBt'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.connectivity?.wlan
                ? `Wi-Fi: ${specs.connectivity.wlan}`
                : null,
              specs.connectivity?.bluetooth
                ? `BT: ${specs.connectivity.bluetooth}`
                : null,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
        {
          id: 'conn_nfc',
          label: t('rowConnNfc'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return formatBool(specs.connectivity?.nfc, t);
          },
        },
        {
          id: 'conn_usb_gps',
          label: t('rowConnUsbGps'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.connectivity?.usb || 'USB Type-C',
              specs.connectivity?.location,
              specs.connectivity?.sensors,
            ].filter(Boolean);
            return parts.join(' | ');
          },
        },
      ],
    },
    {
      id: 'multimedia',
      title: '8. Multimedia',
      icon: BsVolumeUp,
      rows: [
        {
          id: 'mm_speaker',
          label: t('rowMmSpeaker'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            return specs.multimedia?.loudspeaker || t('valDefaultStereo');
          },
        },
        {
          id: 'mm_jack_audio',
          label: t('rowMmJackAudio'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const jack =
              specs.multimedia?.headphone_jack_35mm !== undefined
                ? `3.5mm: ${formatBool(specs.multimedia.headphone_jack_35mm, t)}`
                : null;
            const parts = [jack, specs.multimedia?.audio_features].filter(
              Boolean
            );
            return parts.length > 0 ? parts.join(' | ') : '-';
          },
        },
      ],
    },
    {
      id: 'availability',
      title: '9. Availability',
      icon: BsCalendar3,
      rows: [
        {
          id: 'avail_announced',
          label: t('rowAvailAnnounced'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.availability?.announced,
              specs.availability?.status,
            ].filter(Boolean);
            return parts.length > 0
              ? parts.join(' | ')
              : t('valDefaultAvailable');
          },
        },
        {
          id: 'avail_msrp',
          label: t('rowAvailMsrp'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [specs.availability?.prices_msrp, p.model_key].filter(
              Boolean
            );
            return parts.join(' | ') || '-';
          },
        },
      ],
    },
    {
      id: 'regulatory',
      title: '10. Regulatory',
      icon: BsShieldCheck,
      rows: [
        {
          id: 'reg_cert',
          label: t('rowRegCert'),
          renderValue: (p) => {
            const specs = (p.specifications || {}) as ProductSpecifications;
            const parts = [
              specs.regulatory?.certifications,
              specs.regulatory?.fcc_approval,
              specs.regulatory?.sar_head
                ? t('valSarHeadPrefix', { value: specs.regulatory.sar_head })
                : null,
              specs.regulatory?.sar_body
                ? t('valSarBodyPrefix', { value: specs.regulatory.sar_body })
                : null,
            ].filter(Boolean);
            return parts.length > 0
              ? parts.join(' | ')
              : t('valDefaultRegulatory');
          },
        },
      ],
    },
  ];
}

export default function CompareWorkspace({
  initialProducts,
  catalogCandidates,
  initialCategory = 'smartphones',
  hasExplicitSlugs = false,
  locale = 'vi',
}: CompareWorkspaceProps) {
  const t = useTranslations('compare');
  const router = useRouter();
  const specDict = useMemo(() => getSpecUiDictionary(locale), [locale]);
  const categoryTabs = useMemo(() => buildCategoryTabs(t), [t]);
  const specGroups = useMemo(() => buildSpecGroups(t), [t]);
  const [activeCategory, setActiveCategory] = useState<CanonicalCategorySlug>(
    () =>
      initialProducts.length > 0
        ? getMasterProductCategorySlug(initialProducts[0]!)
        : initialCategory
  );
  const [products, setProducts] = useState<MasterProduct[]>(() => {
    const targetCat =
      initialProducts.length > 0
        ? getMasterProductCategorySlug(initialProducts[0]!)
        : initialCategory;
    return initialProducts.filter(
      (p) => getMasterProductCategorySlug(p) === targetCat
    );
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<MasterProduct[] | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [showDiffOnly, setShowDiffOnly] = useState(false);
  const [highlightWinners, setHighlightWinners] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const radarIndex = useDealRadarIndex();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const restoredTrayRef = useRef(false);

  const activeCategoryMeta = useMemo(
    () =>
      categoryTabs.find((tab) => tab.slug === activeCategory) ||
      categoryTabs[0]!,
    [activeCategory, categoryTabs]
  );

  // Candidates strictly locked to the active category
  const categoryLockedCandidates = useMemo(
    () =>
      catalogCandidates.filter(
        (c) => getMasterProductCategorySlug(c) === activeCategory
      ),
    [catalogCandidates, activeCategory]
  );

  // Sync local products state when server initialProducts prop updates (e.g. Back/Forward navigation)
  useEffect(() => {
    if (initialProducts.length > 0) {
      const cat = getMasterProductCategorySlug(initialProducts[0]!);
      setActiveCategory(cat);
      setProducts(
        initialProducts.filter((p) => getMasterProductCategorySlug(p) === cat)
      );
    }
  }, [initialProducts]);

  // If user visits /compare without ?slugs=, restore their saved Compare Tray (strictly filtered to same category)
  useEffect(() => {
    if (restoredTrayRef.current) return;
    restoredTrayRef.current = true;

    if (!hasExplicitSlugs) {
      const trayItems = getCompareTray();
      if (trayItems.length > 0) {
        const bySlug = new Map(catalogCandidates.map((c) => [c.slug, c]));
        const matched = trayItems
          .map((t) => bySlug.get(t.slug))
          .filter((item): item is MasterProduct => Boolean(item));
        if (matched.length > 0) {
          const primaryCat = getMasterProductCategorySlug(matched[0]!);
          const sameCatMatched = matched.filter(
            (m) => getMasterProductCategorySlug(m) === primaryCat
          );
          setActiveCategory(primaryCat);
          setProducts(sameCatMatched);
          const traySlugsCsv = sameCatMatched.map((t) => t.slug).join(',');
          router.replace(`/compare?slugs=${traySlugsCsv}`, { scroll: false });
          return;
        }
      }
    }

    // Otherwise only show the page's defaults or a shared ?slugs= list: the
    // tray changes on the visitor's own edits (syncSelection), never on load,
    // so it does not follow them site-wide or lose what they saved (#714).
  }, [hasExplicitSlugs, catalogCandidates, router]);

  // Sync URL and localStorage tray whenever compared products change (always locked to 1 category)
  const syncSelection = (
    nextProducts: MasterProduct[],
    explicitCat?: CanonicalCategorySlug
  ) => {
    const targetCat =
      explicitCat ||
      (nextProducts.length > 0
        ? getMasterProductCategorySlug(nextProducts[0]!)
        : activeCategory);
    const sameCategoryProducts = nextProducts.filter(
      (p) => getMasterProductCategorySlug(p) === targetCat
    );
    setActiveCategory(targetCat);
    setProducts(sameCategoryProducts);
    setCompareTray(
      sameCategoryProducts.map((p) => ({
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        thumbnail: resolveProductImageUrl(
          p.slug,
          p.thumbnail ||
            (p.images && p.images.length > 0 ? p.images[0] || null : null)
        ),
        min_price: Number(p.min_price || 0),
        categorySlug: targetCat,
      }))
    );
    const slugsCsv = sameCategoryProducts.map((p) => p.slug).join(',');
    const nextUrl = slugsCsv
      ? `/compare?slugs=${slugsCsv}`
      : `/compare?category=${targetCat}`;
    router.replace(nextUrl, { scroll: false });
  };

  const handleSwitchCategoryTab = (nextCat: CanonicalCategorySlug) => {
    if (nextCat === activeCategory && products.length > 0) return;
    setReplaceIndex(null);
    setSearchQuery('');
    setDropdownOpen(false);
    const nextDefaults = catalogCandidates
      .filter((c) => getMasterProductCategorySlug(c) === nextCat)
      .slice(0, 3);
    syncSelection(nextDefaults, nextCat);
  };

  // Close autocomplete dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
        setReplaceIndex(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Debounced remote search via Layer 1 REST API `/api/v1/rate/products` (locked to activeCategory)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/v1/rate/products?category=${encodeURIComponent(activeCategory)}&q=${encodeURIComponent(q)}&limit=8`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            ok: boolean;
            data?: MasterProduct[];
          };
          if (json.ok && Array.isArray(json.data)) {
            setRemoteResults(
              json.data.filter(
                (item) => getMasterProductCategorySlug(item) === activeCategory
              )
            );
          }
        }
      } catch {
        // Ignore abort errors
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, activeCategory]);

  // Combine instant client-side matches + remote REST API matches (strictly within activeCategory)
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return categoryLockedCandidates.slice(0, 8);
    }
    const localFiltered = categoryLockedCandidates.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q)
    );
    const mergedMap = new Map<string, MasterProduct>();
    for (const item of [...localFiltered, ...(remoteResults ?? [])]) {
      if (
        getMasterProductCategorySlug(item) === activeCategory &&
        !mergedMap.has(item.slug)
      ) {
        mergedMap.set(item.slug, item);
      }
    }
    return Array.from(mergedMap.values()).slice(0, 8);
  }, [searchQuery, remoteResults, categoryLockedCandidates, activeCategory]);

  const selectedSlugs = useMemo(
    () => new Set(products.map((p) => p.slug)),
    [products]
  );

  const handleSelectCandidate = (candidate: MasterProduct) => {
    const candidateCat = getMasterProductCategorySlug(candidate);
    if (candidateCat !== activeCategory) {
      syncSelection([candidate], candidateCat);
      setReplaceIndex(null);
      setSearchQuery('');
      setDropdownOpen(false);
      return;
    }

    if (
      replaceIndex !== null &&
      replaceIndex >= 0 &&
      replaceIndex < products.length
    ) {
      const next = [...products];
      next[replaceIndex] = candidate;
      const deduped = Array.from(
        new Map(next.map((p) => [p.slug, p])).values()
      );
      syncSelection(deduped, activeCategory);
      setReplaceIndex(null);
      setSearchQuery('');
      setDropdownOpen(false);
      return;
    }

    if (selectedSlugs.has(candidate.slug)) {
      return;
    }
    if (products.length >= MAX_COMPARE_ITEMS) {
      return;
    }
    syncSelection([...products, candidate], activeCategory);
    setSearchQuery('');
    setDropdownOpen(false);
  };

  const handleRemoveProduct = (slug: string) => {
    syncSelection(
      products.filter((p) => p.slug !== slug),
      activeCategory
    );
  };

  const handleStartReplace = (idx: number) => {
    setReplaceIndex(idx);
    setDropdownOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const [watchedAllToast, setWatchedAllToast] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const popularBattles = useMemo(
    () =>
      buildPopular1v1BattlesForCategory(catalogCandidates, activeCategory, 3),
    [catalogCandidates, activeCategory]
  );

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleCopyMarkdownReport = async () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    try {
      const headerCols = [t('mdReportColSpec'), ...products.map((p) => p.name)];
      const sepCols = headerCols.map(() => '---');
      const lines: string[] = [
        `### ${t('mdReportTitle', { category: activeCategoryMeta.label })}`,
        `- **${t('mdAuditUrl')}:** ${window.location.href}`,
        '',
        `| ${headerCols.join(' | ')} |`,
        `| ${sepCols.join(' | ')} |`,
        `| **${t('mdRowUserRating')}** | ${products
          .map((p) => {
            const r = getEffectiveRating(p);
            const cnt = p.authentic_review_count || p.total_reviews || 0;
            return r > 0
              ? `★ ${r.toFixed(1)}/5.0 (${cnt} review)`
              : t('unratedShort');
          })
          .join(' | ')} |`,
        `| **${t('mdRowExpertRating')}** | ${products
          .map((p) => {
            const exp5 = resolveCompareExpertRating5(p);
            return exp5 != null
              ? `Lab ${exp5.toFixed(1)}/5.0`
              : t('unratedShort');
          })
          .join(' | ')} |`,
        `| **${t('mdRowMinPrice')}** | ${products
          .map((p) =>
            Number(p.min_price) > 0
              ? `${Number(p.min_price).toLocaleString('vi-VN')} ₫`
              : '-'
          )
          .join(' | ')} |`,
        `| **${t('mdRowDealRadar')}** | ${products
          .map((p) =>
            radarMarkdownCell(getRadarSignal(radarIndex, p.slug), locale)
          )
          .join(' | ')} |`,
        `| **${t('mdRowHardwareMemory')}** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            const ram = resolveCompareRamGb(p);
            const rom = resolveCompareStorageGb(p);
            const parts = [
              ks.chip,
              ram ? `${ram}GB RAM` : ks.ram,
              rom
                ? `${rom >= 1024 ? `${rom / 1024}TB` : `${rom}GB`}`
                : ks.storage,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' / ') : '-';
          })
          .join(' | ')} |`,
        `| **${t('mdRowBatteryEnergy')}** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            const mah = resolveCompareBatteryMah(p);
            return mah ? `${mah} mAh` : ks.battery || '-';
          })
          .join(' | ')} |`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadCompareCsv = () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    const headers = [
      t('csvColSpecGroup'),
      t('csvColTechCriterion'),
      ...products.map((p) => p.name),
    ];
    const productRadarCells = products.map((p) =>
      radarCsvCells(getRadarSignal(radarIndex, p.slug))
    );
    const rows: string[] = [
      headers.map(escapeCsvCell).join(','),
      [
        t('csvRadarGroupTitle'),
        t('csvRadarVerdictRow'),
        ...products.map((p) =>
          radarLabel(getRadarSignal(radarIndex, p.slug), 0, locale)
        ),
      ]
        .map((c) => escapeCsvCell(c))
        .join(','),
      ...RADAR_CSV_HEADERS.map((hdr, idx) =>
        [
          t('csvRadarGroupTitle'),
          hdr,
          ...productRadarCells.map((cells) => cells[idx] ?? ''),
        ]
          .map((c) => escapeCsvCell(c))
          .join(',')
      ),
    ];
    for (const group of specGroups) {
      for (const row of group.rows) {
        const vals = products.map((p) => row.renderValue(p));
        if (vals.every((v) => !v || v === '-')) continue;
        rows.push(
          [group.title, row.label, ...vals]
            .map((c) => escapeCsvCell(c))
            .join(',')
        );
      }
    }
    const blob = new Blob([`\uFEFF${rows.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-compare-${activeCategory}-${products.map((p) => p.slug).join('-vs-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCompareJson = () => {
    if (typeof window === 'undefined' || products.length === 0) return;
    const payload = {
      source: 'Rate.vn Compare Matrix',
      category: activeCategory,
      exportedAt: new Date().toISOString(),
      productCount: products.length,
      products: products.map((p) => {
        const u = getEffectiveRating(p);
        const e = resolveCompareExpertRating5(p);
        return {
          slug: p.slug,
          name: p.name,
          brand: p.brand,
          userRating: u > 0 ? u : null,
          expertRating: e,
          minPriceVnd: Number(p.min_price || 0),
          dealRadar: radarExportFields(getRadarSignal(radarIndex, p.slug)),
        };
      }),
      matrix: specGroups.map((group) => ({
        groupId: group.id,
        groupTitle: group.title,
        rows: group.rows.map((row) => ({
          id: row.id,
          label: row.label,
          values: Object.fromEntries(
            products.map((p) => [p.slug, row.renderValue(p)])
          ),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-compare-${activeCategory}-${products.map((p) => p.slug).join('-vs-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleWatchAllCompared = () => {
    for (const p of products) {
      const minP = Math.max(0, Number(p.min_price || 0));
      const targetP =
        minP > 0
          ? Math.max(100_000, Math.round((minP * 0.95) / 100_000) * 100_000)
          : 10_000_000;
      const thumb = resolveProductImageUrl(
        p.slug,
        p.thumbnail ||
          (p.images && p.images.length > 0 ? p.images[0] || null : null)
      );
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
    }
    setWatchedAllToast(true);
    setTimeout(() => setWatchedAllToast(false), 2200);
  };

  const headToHeadSummary = useMemo(() => {
    if (products.length < 2) return null;
    const byRating = [...products]
      .filter((p) => getEffectiveRating(p) > 0)
      .sort((a, b) => getEffectiveRating(b) - getEffectiveRating(a));
    const byPrice = [...products]
      .filter((p) => Number(p.min_price || 0) > 0)
      .sort((a, b) => Number(a.min_price || 0) - Number(b.min_price || 0));
    const byMemory = [...products]
      .filter((p) => resolveCompareMemoryScore(p) > 0)
      .sort(
        (a, b) => resolveCompareMemoryScore(b) - resolveCompareMemoryScore(a)
      );
    const byBattery = [...products]
      .filter((p) => (resolveCompareBatteryMah(p) ?? 0) > 0)
      .sort(
        (a, b) =>
          (resolveCompareBatteryMah(b) ?? 0) -
          (resolveCompareBatteryMah(a) ?? 0)
      );
    return {
      bestRated: byRating[0] ?? null,
      lowestPrice: byPrice[0] ?? null,
      highestMemory: byMemory[0] ?? null,
      bestBattery: byBattery[0] ?? null,
    };
  }, [products]);

  return (
    <div>
      {/* 5-Category Lock Switcher Bar */}
      <div className="rate-card mb-3 p-3">
        <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-2">
          <div className="small fw-semibold text-secondary">
            {t('categoryLockLabel')}
          </div>
          <div
            className="d-flex flex-wrap gap-2"
            role="tablist"
            aria-label={t('categoryTabsAria')}
          >
            {categoryTabs.map((tab) => {
              const isActive = tab.slug === activeCategory;
              const count = catalogCandidates.filter(
                (c) => getMasterProductCategorySlug(c) === tab.slug
              ).length;
              return (
                <button
                  key={tab.slug}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleSwitchCategoryTab(tab.slug)}
                  className={`btn btn-sm rounded-pill fw-semibold px-3 py-1 ${
                    isActive
                      ? 'btn-dark text-white'
                      : 'btn-light text-secondary border'
                  }`}
                >
                  {tab.label} <span className="rate-tabular">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Interactive Autocomplete Search & Control Bar */}
      <div className="rate-card p-md-4 mb-4 p-3">
        <div className="row g-3 align-items-center">
          {/* Autocomplete Input */}
          <div className="col-lg-6" ref={searchBoxRef}>
            <label
              htmlFor="compare-autocomplete-input"
              className="form-label fw-bold small text-uppercase text-muted mb-1"
            >
              {replaceIndex !== null && products[replaceIndex]
                ? t('replacingDeviceLabel', {
                    unit: activeCategoryMeta.unitLabel,
                    name: products[replaceIndex]?.name ?? '',
                  })
                : t('searchAddDeviceLabel', {
                    category: activeCategoryMeta.label,
                    count: products.length,
                    max: MAX_COMPARE_ITEMS,
                  })}
            </label>
            <div className="position-relative">
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0 rounded-start-pill ps-3">
                  <BsSearch aria-hidden="true" />
                </span>
                <input
                  ref={searchInputRef}
                  id="compare-autocomplete-input"
                  type="text"
                  value={searchQuery}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDropdownOpen(true);
                  }}
                  placeholder={
                    products.length >= MAX_COMPARE_ITEMS &&
                    replaceIndex === null
                      ? t('maxDevicesPlaceholder')
                      : t('searchDevicePlaceholder', {
                          unit: activeCategoryMeta.unitLabel,
                        })
                  }
                  disabled={
                    products.length >= MAX_COMPARE_ITEMS &&
                    replaceIndex === null
                  }
                  className="form-control bg-light border-start-0 rounded-end-pill py-2"
                />
                {replaceIndex !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceIndex(null);
                      setDropdownOpen(false);
                    }}
                    className="btn btn-outline-secondary rounded-pill btn-sm ms-2"
                  >
                    {t('cancelReplaceBtn')}
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown */}
              {dropdownOpen &&
                (products.length < MAX_COMPARE_ITEMS ||
                  replaceIndex !== null) && (
                  <div
                    className="card rounded-4 position-absolute mt-2 w-100 overflow-hidden border shadow-lg"
                    style={{
                      zIndex: 1050,
                      maxHeight: '380px',
                      overflowY: 'auto',
                    }}
                  >
                    <div className="bg-light border-bottom d-flex justify-content-between align-items-center px-3 py-2">
                      <span className="small fw-semibold text-muted">
                        {searchQuery.trim()
                          ? t('searchResultsFor', {
                              category: activeCategoryMeta.label,
                              query: searchQuery.trim(),
                            })
                          : t('sameCategoryList', {
                              unit: activeCategoryMeta.unitLabel,
                            })}
                      </span>
                      {isSearching && (
                        <span className="badge bg-secondary rounded-pill small">
                          {t('searchingBadge')}
                        </span>
                      )}
                    </div>

                    {suggestions.length === 0 ? (
                      <div className="text-muted small p-4 text-center">
                        {t('noMatchingDevices', {
                          unit: activeCategoryMeta.unitLabel,
                          query: searchQuery,
                        })}
                      </div>
                    ) : (
                      <div className="list-group list-group-flush">
                        {suggestions.map((item) => {
                          const alreadySelected = selectedSlugs.has(item.slug);
                          const thumb = resolveProductImageUrl(
                            item.slug,
                            item.thumbnail ||
                              (item.images && item.images.length > 0
                                ? item.images[0]
                                : null)
                          );
                          const priceFormatted = Number(
                            item.min_price || 0
                          ).toLocaleString('vi-VN');
                          const rating = getEffectiveRating(item);

                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={alreadySelected}
                              onClick={() => handleSelectCandidate(item)}
                              className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3 px-3 py-2 ${
                                alreadySelected ? 'bg-light opacity-75' : ''
                              }`}
                            >
                              <div className="d-flex align-items-center gap-3 overflow-hidden">
                                <div
                                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0 border bg-white"
                                  style={{
                                    width: '44px',
                                    height: '44px',
                                    padding: '4px',
                                  }}
                                >
                                  {thumb ? (
                                    <img
                                      loading="lazy"
                                      decoding="async"
                                      src={thumb}
                                      alt={item.name}
                                      style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                      }}
                                    />
                                  ) : (
                                    <span className="small text-muted">SP</span>
                                  )}
                                </div>
                                <div className="overflow-hidden text-start">
                                  <div className="fw-bold text-dark text-truncate small">
                                    {item.name}
                                  </div>
                                  <div className="d-flex align-items-center mt-1 flex-wrap gap-2">
                                    <span className="rate-spec-pill">
                                      {item.brand}
                                    </span>
                                    <span className="rate-score-badge-user">
                                      ★{' '}
                                      {rating > 0
                                        ? rating.toFixed(1)
                                        : t('unratedShort')}
                                    </span>
                                    <span
                                      className="text-secondary fw-semibold rate-tabular"
                                      style={{ fontSize: '0.8125rem' }}
                                    >
                                      {priceFormatted} ₫
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <span
                                className={`badge rounded-pill flex-shrink-0 px-3 py-2 ${
                                  alreadySelected
                                    ? 'bg-secondary text-white'
                                    : replaceIndex !== null
                                      ? 'bg-dark text-white'
                                      : 'bg-danger text-white'
                                }`}
                              >
                                {alreadySelected
                                  ? t('alreadyComparingBadge')
                                  : replaceIndex !== null
                                    ? t('selectReplacementBadge')
                                    : t('addToCompareBadge')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>

          {/* Comparison Mode Toggles & Share Button */}
          <div className="col-lg-6">
            <div className="d-flex align-items-center justify-content-lg-end pt-lg-3 flex-wrap gap-3">
              <div className="form-check form-switch mb-0">
                <input
                  id="toggle-diff-only"
                  type="checkbox"
                  className="form-check-input"
                  checked={showDiffOnly}
                  onChange={(e) => setShowDiffOnly(e.target.checked)}
                />
                <label
                  htmlFor="toggle-diff-only"
                  className="form-check-label small fw-semibold"
                >
                  {t('showDiffOnlyToggle')}
                </label>
              </div>

              <div className="form-check form-switch mb-0">
                <input
                  id="toggle-highlight-winners"
                  type="checkbox"
                  className="form-check-input"
                  checked={highlightWinners}
                  onChange={(e) => setHighlightWinners(e.target.checked)}
                />
                <label
                  htmlFor="toggle-highlight-winners"
                  className="form-check-label small fw-semibold"
                >
                  {t('highlightWinnersToggle')}
                </label>
              </div>

              <button
                type="button"
                onClick={handleCopyShareLink}
                className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
              >
                {copiedLink ? t('copiedLinkToast') : t('copyCompareLinkBtn')}
              </button>

              {products.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyMarkdownReport}
                    className="btn btn-sm btn-outline-danger rounded-pill fw-medium px-3 py-2"
                  >
                    {copiedMarkdown
                      ? t('copiedMarkdownToast')
                      : t('copyMarkdownTableBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareCsv}
                    data-testid="compare-export-csv-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    CSV ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareJson}
                    data-testid="compare-export-json-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    JSON ({products.length})
                  </button>
                </>
              )}

              {products.length === 2 && products[0] && products[1] && (
                <Link
                  href={`/compare/${products[0].slug}-vs-${products[1].slug}`}
                  className="btn btn-sm btn-dark rounded-pill fw-medium px-3 py-2"
                >
                  {t('deep1v1PageBtn')}
                </Link>
              )}

              {products.length > 0 && (
                <button
                  type="button"
                  onClick={handleWatchAllCompared}
                  className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3 py-2"
                >
                  {watchedAllToast
                    ? t('savedWatchlistToast')
                    : t('watchAllGroupBtn', { count: products.length })}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Preset Chips strictly from Same Category */}
        {categoryLockedCandidates.length >= 2 && (
          <div className="d-flex align-items-center border-top mt-3 flex-wrap gap-2 pt-3">
            <span className="small text-muted fw-medium me-1">
              {t('quickAddSameCategory', {
                unit: activeCategoryMeta.unitLabel,
              })}
            </span>
            {categoryLockedCandidates
              .filter((c) => !selectedSlugs.has(c.slug))
              .slice(0, 5)
              .map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  disabled={products.length >= MAX_COMPARE_ITEMS}
                  onClick={() => handleSelectCandidate(c)}
                  className="btn btn-sm btn-light rounded-pill small border px-3 py-1"
                >
                  + {c.name}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Popular 1v1 Head-to-Head Battles Hub for Active Category */}
      {popularBattles.length > 0 && (
        <div className="rate-card p-md-4 mb-4 p-3">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <div className="rate-eyebrow mb-1">
                {t('popular1v1Eyebrow', {
                  category: activeCategoryMeta.label,
                })}
              </div>
              <h2 className="h6 fw-bold text-dark mb-0">
                {t('popular1v1Heading', {
                  category: activeCategoryMeta.label,
                })}
              </h2>
            </div>
            <Link
              href={`/leaderboard?cat=${activeCategory}`}
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
            >
              {t('viewLeaderboardCategoryBtn', {
                category: activeCategoryMeta.label,
              })}
            </Link>
          </div>

          <div className="row g-3">
            {popularBattles.map((battle) => (
              <div key={battle.versusSlug} className="col-lg-4 col-md-6">
                <div className="rounded-4 d-flex flex-column justify-content-between bg-light h-100 border p-3">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="badge bg-dark rounded-pill small text-white">
                        #{battle.productA.rank} vs #{battle.productB.rank}{' '}
                        {activeCategoryMeta.label}
                      </span>
                      <span className="badge bg-danger-subtle text-danger rounded-pill small rate-tabular">
                        {t('scoreDeltaBadge', {
                          delta: battle.scoreDelta5.toFixed(2),
                        })}
                      </span>
                    </div>

                    <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={battle.productA.thumbnail}
                          alt={battle.productA.name}
                          className="rounded-2 flex-shrink-0 border bg-white p-1"
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain',
                          }}
                        />
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {battle.productA.name}
                          </div>
                          <div className="small text-secondary rate-tabular">
                            ★ {battle.productA.combinedScore5.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <span className="badge bg-secondary rounded-pill flex-shrink-0">
                        VS
                      </span>

                      <div className="d-flex align-items-center gap-2 overflow-hidden text-end">
                        <div className="overflow-hidden">
                          <div className="small fw-bold text-dark text-truncate">
                            {battle.productB.name}
                          </div>
                          <div className="small text-secondary rate-tabular">
                            ★ {battle.productB.combinedScore5.toFixed(2)}
                          </div>
                        </div>
                        <img
                          loading="lazy"
                          decoding="async"
                          src={battle.productB.thumbnail}
                          alt={battle.productB.name}
                          className="rounded-2 flex-shrink-0 border bg-white p-1"
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: 'contain',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center border-top mt-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        syncSelection(
                          [battle.productA.product, battle.productB.product],
                          activeCategory
                        )
                      }
                      className="btn btn-sm btn-outline-secondary rounded-pill small px-3"
                    >
                      {t('loadIntoMatrixBtn')}
                    </button>
                    <Link
                      href={battle.versusHref}
                      className="btn btn-sm btn-dark rounded-pill small fw-semibold px-3"
                    >
                      {t('go1v1Btn')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automated Head-to-Head 10-Group Verdict Summary Card */}
      {headToHeadSummary && (
        <div className="rate-scoreboard-dark p-md-4 mb-4 p-3 shadow-sm">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div className="d-flex align-items-center flex-wrap gap-2">
              <span
                className="badge rounded-pill fw-semibold px-3 py-1"
                style={{
                  backgroundColor: 'rgba(45, 186, 105, 0.16)',
                  color: '#34d399',
                  border: '1px solid rgba(45, 186, 105, 0.3)',
                }}
              >
                {t('verdictBadge', { category: activeCategoryMeta.label })}
              </span>
              <span className="fw-bold text-white">
                {t('verdictSummaryHeading', {
                  count: products.length,
                  category: activeCategoryMeta.label,
                })}
              </span>
            </div>
            <Link
              href={`/${activeCategory}`}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
            >
              {t('viewAllCategoryBtn', { category: activeCategoryMeta.label })}
            </Link>
          </div>
          <div className="row g-3">
            {headToHeadSummary.bestRated && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: '#34d399' }}
                  >
                    {t('verdictHighestRatedTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestRated.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    ★{' '}
                    {getEffectiveRating(headToHeadSummary.bestRated).toFixed(1)}{' '}
                    / 5.0 {t('verdictAiFilteredNote')}
                  </div>
                </div>
              </div>
            )}
            {headToHeadSummary.highestMemory && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: '#818cf8' }}
                  >
                    {t('verdictTopHardwareTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.highestMemory.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {(() => {
                      const ram = resolveCompareRamGb(
                        headToHeadSummary.highestMemory
                      );
                      const rom = resolveCompareStorageGb(
                        headToHeadSummary.highestMemory
                      );
                      return `${ram ? `${ram}GB RAM - ` : ''}${
                        rom
                          ? rom >= 1024
                            ? `${rom / 1024}TB`
                            : `${rom}GB`
                          : t('verdictNormalized10Groups')
                      }`;
                    })()}
                  </div>
                </div>
              </div>
            )}
            {headToHeadSummary.bestBattery && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: '#fbbf24' }}
                  >
                    {t('verdictBestBatteryTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestBattery.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {(() => {
                      const mah = resolveCompareBatteryMah(
                        headToHeadSummary.bestBattery
                      );
                      return mah
                        ? `${mah} mAh`
                        : t('verdictNormalized10Groups');
                    })()}
                  </div>
                </div>
              </div>
            )}
            {headToHeadSummary.lowestPrice && (
              <div className="col-lg-3 col-md-6">
                <div
                  className="rounded-3 h-100 p-3"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    className="small fw-bold mb-1"
                    style={{ color: '#94a3b8' }}
                  >
                    {t('verdictLowestPriceTitle')}
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.lowestPrice.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {Number(
                      headToHeadSummary.lowestPrice.min_price || 0
                    ).toLocaleString('vi-VN')}{' '}
                    ₫
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State if 0 products */}
      {products.length === 0 ? (
        <div className="rate-card p-5 text-center">
          <h4 className="fw-bold mb-2">
            {t('emptyMatrixTitle', { unit: activeCategoryMeta.unitLabel })}
          </h4>
          <p className="text-muted mb-4">
            {t('emptyMatrixDesc', { unit: activeCategoryMeta.unitLabel })}
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
            {categoryLockedCandidates.slice(0, 3).map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => handleSelectCandidate(c)}
                className="btn btn-dark rounded-pill px-4"
              >
                {t('addDeviceQuickBtn', { name: c.name })}
              </button>
            ))}
            <Link
              href={`/${activeCategory}`}
              className="btn btn-outline-secondary rounded-pill px-4"
            >
              {t('viewCategoryCatalogBtn', {
                category: activeCategoryMeta.label,
              })}
            </Link>
          </div>
        </div>
      ) : (
        <div className="rate-card p-md-4 overflow-hidden p-3">
          <div className="table-responsive">
            <table className="table-bordered mb-0 table text-center align-middle">
              {/* Product Column Headers */}
              <thead className="table-light">
                <tr>
                  <th
                    style={{ width: '230px', minWidth: '200px' }}
                    className="bg-light p-3 text-start align-middle"
                  >
                    <div className="rate-eyebrow mb-2">
                      {activeCategoryMeta.label}
                    </div>
                    <div className="fw-bold text-dark mb-1">
                      {t('matrixHeaderTitle')}
                    </div>
                    <div
                      className="text-muted fw-normal"
                      style={{ fontSize: '0.8125rem' }}
                    >
                      {t('matrixHeaderSubtitle', {
                        count: products.length,
                        unit: activeCategoryMeta.unitLabel,
                      })}
                    </div>
                  </th>

                  {products.map((p, idx) => {
                    const thumb = resolveProductImageUrl(
                      p.slug,
                      p.thumbnail ||
                        (p.images && p.images.length > 0 ? p.images[0] : null)
                    );
                    const minPrice = Number(p.min_price || 0);
                    const minPriceFormatted = minPrice.toLocaleString('vi-VN');
                    const userRating = getEffectiveRating(p);
                    const expertRating = resolveCompareExpertRating5(p);
                    const reviewCount =
                      p.authentic_review_count || p.total_reviews || 0;

                    return (
                      <th
                        key={p.id}
                        style={{ minWidth: '240px' }}
                        className="position-relative bg-white p-3 align-top"
                      >
                        {/* Top action buttons: Replace & Remove */}
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <button
                            type="button"
                            onClick={() => handleStartReplace(idx)}
                            className="btn btn-sm btn-light rounded-pill small text-muted border px-2 py-0"
                            title={t('replaceDeviceTitle', {
                              unit: activeCategoryMeta.unitLabel,
                            })}
                          >
                            {t('replaceDeviceBtn')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(p.slug)}
                            className="rate-remove-target btn btn-sm border-0 d-inline-flex align-items-center justify-content-center p-0"
                            title={t('removeDeviceTitle')}
                            aria-label={t('removeDeviceAria', { name: p.name })}
                          >
                            <span
                              className="rate-remove-dot rounded-circle d-inline-flex align-items-center justify-content-center"
                              aria-hidden="true"
                            >
                              ×
                            </span>
                          </button>
                        </div>

                        <div className="d-flex flex-column align-items-center">
                          <div
                            className="rounded-3 d-flex align-items-center justify-content-center position-relative mb-2 border bg-white p-2"
                            style={{ height: '148px', width: '148px' }}
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={p.name}
                                style={{
                                  maxHeight: '132px',
                                  maxWidth: '132px',
                                  objectFit: 'contain',
                                }}
                              />
                            ) : (
                              <div className="text-muted small">{p.brand}</div>
                            )}
                          </div>

                          <span className="rate-spec-pill mb-1">{p.brand}</span>

                          <Link
                            href={getMasterProductHref(p)}
                            className="fw-bold text-dark text-decoration-none h6 mb-2"
                          >
                            {p.name}
                          </Link>

                          {/* Core Rating Badges First (Per DESIGN.md v3.0) */}
                          <div className="d-flex justify-content-center mb-2 flex-wrap gap-1">
                            <span className="rate-score-badge-user">
                              ★{' '}
                              {userRating > 0
                                ? `${userRating.toFixed(1)} (${reviewCount})`
                                : t('unratedShort')}
                            </span>
                            {expertRating != null && (
                              <span className="rate-score-badge-expert">
                                Lab {expertRating.toFixed(1)}
                              </span>
                            )}
                          </div>

                          {/* Neutral Reference Price */}
                          <div className="text-secondary small fw-semibold rate-tabular mb-2">
                            {t('referencePriceLabel')}{' '}
                            <strong className="text-dark">
                              {minPriceFormatted} ₫
                            </strong>
                          </div>

                          <div
                            className="mb-2"
                            data-testid="compare-radar-signal"
                          >
                            <RadarBadge
                              signal={getRadarSignal(radarIndex, p.slug)}
                              minSpreadPct={Infinity}
                            />
                          </div>

                          <div className="d-flex mt-1 gap-2">
                            <Link
                              href={`${getMasterProductHref(p)}#jreviews-section`}
                              className="btn btn-sm btn-dark rounded-pill fw-medium px-3"
                            >
                              {t('readReviewsAndScoreBtn')}
                            </Link>
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  {/* Empty Add-Device Slot Column if fewer than 4 products */}
                  {products.length < MAX_COMPARE_ITEMS && (
                    <th
                      style={{ minWidth: '210px', width: '220px' }}
                      className="bg-light p-3 align-middle"
                    >
                      <div className="d-flex flex-column align-items-center justify-content-center py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceIndex(null);
                            setDropdownOpen(true);
                            searchInputRef.current?.focus();
                          }}
                          className="btn btn-outline-dark rounded-circle d-flex align-items-center justify-content-center mb-2"
                          style={{
                            width: '52px',
                            height: '52px',
                            fontSize: '24px',
                          }}
                          title={t('addSameCategoryTitle', {
                            unit: activeCategoryMeta.unitLabel,
                          })}
                        >
                          +
                        </button>
                        <div className="fw-bold small text-dark mb-1">
                          {t('addCategorySlotTitle', {
                            category: activeCategoryMeta.label,
                          })}
                        </div>
                        <div
                          className="text-muted fw-normal"
                          style={{ fontSize: '0.8125rem' }}
                        >
                          {t('remainingSlotsSub', {
                            remaining: MAX_COMPARE_ITEMS - products.length,
                          })}
                        </div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                <tr data-testid="compare-radar-row">
                  <td className="text-muted small fw-semibold bg-light text-start">
                    {t('radarRowMatrixTitle')}
                  </td>
                  {products.map((p) => {
                    const sig = getRadarSignal(radarIndex, p.slug);
                    if (sig.verdict === 'none') {
                      return (
                        <td
                          key={`radar-${p.id}`}
                          className="small text-secondary"
                        >
                          {t('radarStableMedian')}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={`radar-${p.id}`}
                        className={`small fw-semibold ${
                          sig.verdict === 'genuine_deal'
                            ? 'bg-success bg-opacity-10 text-success'
                            : 'bg-danger bg-opacity-10 text-danger'
                        }`}
                      >
                        {sig.verdict === 'genuine_deal'
                          ? t('radarGenuineFloor', {
                              pct: sig.savingsPct.toFixed(1),
                              platform: (
                                sig.genuineDeal?.platform ?? ''
                              ).toUpperCase(),
                            })
                          : t('radarFakeMarkup', {
                              pct: sig.fakeMarkupPct.toFixed(1),
                            })}
                      </td>
                    );
                  })}
                  {products.length < MAX_COMPARE_ITEMS && (
                    <td className="bg-light text-muted small">-</td>
                  )}
                </tr>
                {specGroups.map((group) => {
                  // Filter rows when `showDiffOnly` is enabled
                  const visibleRows = group.rows.filter((row) => {
                    if (!showDiffOnly || products.length < 2) return true;
                    const rendered = products.map((p) =>
                      row.renderValue(p).trim()
                    );
                    const uniqueVals = new Set(rendered);
                    return uniqueVals.size > 1;
                  });

                  if (visibleRows.length === 0) {
                    return null;
                  }

                  const totalCols =
                    products.length +
                    1 +
                    (products.length < MAX_COMPARE_ITEMS ? 1 : 0);

                  const groupTitle =
                    group.id in specDict.groups
                      ? specDict.groups[
                          group.id as keyof typeof specDict.groups
                        ]
                      : group.title;

                  return (
                    <React.Fragment key={group.id}>
                      <tr className="table-secondary fw-bold text-start">
                        <td colSpan={totalCols} className="px-3 py-2">
                          <group.icon aria-hidden="true" className="me-2" />
                          {groupTitle}
                        </td>
                      </tr>

                      {visibleRows.map((row) => {
                        // Compute best numeric value across compared products if applicable
                        let bestNumeric: number | null = null;
                        if (
                          highlightWinners &&
                          products.length > 1 &&
                          row.numericValue
                        ) {
                          const nums = products
                            .map((p) => row.numericValue?.(p) ?? null)
                            .filter(
                              (n): n is number => n !== null && !Number.isNaN(n)
                            );
                          if (nums.length >= 2) {
                            const uniqueNums = new Set(nums);
                            if (uniqueNums.size > 1) {
                              bestNumeric =
                                row.higherIsBetter === false
                                  ? Math.min(...nums)
                                  : Math.max(...nums);
                            }
                          }
                        }

                        return (
                          <tr key={row.id}>
                            <td className="text-muted small fw-medium bg-light text-start">
                              {row.label}
                            </td>
                            {products.map((p) => {
                              const textVal = localizeSpecValue(
                                row.renderValue(p),
                                locale
                              );
                              const numVal = row.numericValue?.(p) ?? null;
                              const isWinner =
                                bestNumeric !== null &&
                                numVal !== null &&
                                numVal === bestNumeric;

                              return (
                                <td
                                  key={`${row.id}-${p.id}`}
                                  className={`small ${
                                    isWinner
                                      ? 'bg-success bg-opacity-10 fw-bold text-success'
                                      : 'text-dark'
                                  }`}
                                >
                                  <ContentText text={textVal} locale={locale} />
                                  {isWinner && (
                                    <span
                                      className="badge bg-success rounded-pill ms-1 text-white"
                                      style={{ fontSize: '0.8125rem' }}
                                    >
                                      {t('bestBadge')}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            {products.length < MAX_COMPARE_ITEMS && (
                              <td className="bg-light text-muted small">-</td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
