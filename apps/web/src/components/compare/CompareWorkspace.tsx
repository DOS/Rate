'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/lib/navigation';
import type {
  KeySpecs,
  MasterProduct,
  ProductSpecifications,
} from '@repo/shared-data';
import {
  type CanonicalCategorySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  resolveProductImageUrl,
} from '@/lib/rate-api';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  getCompareTray,
  MAX_COMPARE_ITEMS,
  setCompareTray,
} from './compare-tray';
import { upsertWatchlistItem } from '@/components/watchlist/watchlist-store';
import { getSpecUiDictionary, localizeSpecValue } from '@/lib/spec-localizer';
import { buildPopular1v1BattlesForCategory } from '@/lib/leaderboard-engine';

interface CompareWorkspaceProps {
  initialProducts: MasterProduct[];
  catalogCandidates: MasterProduct[];
  initialCategory?: CanonicalCategorySlug;
  hasExplicitSlugs?: boolean;
  locale?: string;
}

const CATEGORY_TABS: Array<{
  slug: CanonicalCategorySlug;
  label: string;
  unitLabel: string;
}> = [
  { slug: 'smartphones', label: 'Điện thoại', unitLabel: 'mẫu điện thoại' },
  { slug: 'tablets', label: 'Máy tính bảng', unitLabel: 'mẫu tablet' },
  { slug: 'laptops', label: 'Laptop', unitLabel: 'mẫu laptop' },
  {
    slug: 'smartwatches',
    label: 'Đồng hồ thông minh',
    unitLabel: 'mẫu smartwatch',
  },
  { slug: 'earbuds', label: 'Tai nghe', unitLabel: 'mẫu tai nghe' },
];

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
  icon: string;
  rows: SpecRowDef[];
}

function formatBool(val: boolean | string | undefined | null): string {
  if (typeof val === 'string' && val.trim()) return val;
  if (val === true) return 'Có';
  if (val === false) return 'Không';
  return '-';
}

function getEffectiveRating(p: MasterProduct): number {
  const weighted = Number(p.user_rating_weighted || 0);
  if (weighted > 0) return weighted;
  return Number(p.average_rating || 0);
}

const SPEC_GROUPS: SpecGroupDef[] = [
  {
    id: 'market_trust',
    title: '0. Điểm Đánh Giá Đa Chiều & Tín Nhiệm (JReviews Core)',
    icon: '⭐',
    rows: [
      {
        id: 'rating_weighted',
        label: 'Điểm Người mua thực chất (đã lọc Seeding AI)',
        renderValue: (p) => {
          const r = getEffectiveRating(p);
          const count = p.authentic_review_count || p.total_reviews || 0;
          return r > 0
            ? `★ ${r.toFixed(1)} / 5.0 (${count} review thật)`
            : 'Chưa có đánh giá';
        },
        numericValue: (p) => {
          const r = getEffectiveRating(p);
          return r > 0 ? r : null;
        },
        higherIsBetter: true,
      },
      {
        id: 'expert_rating',
        label: 'Điểm Chuyên gia Rate Lab (Expert Score)',
        renderValue: (p) =>
          p.expert_rating && Number(p.expert_rating) > 0
            ? `Lab ${Number(p.expert_rating).toFixed(1)} / 5.0`
            : '-',
        numericValue: (p) =>
          p.expert_rating && Number(p.expert_rating) > 0
            ? Number(p.expert_rating)
            : null,
        higherIsBetter: true,
      },
      {
        id: 'min_price',
        label: 'Giá tham khảo thấp nhất (Đã kiểm định)',
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
        label: 'Biên độ giá giữa các nguồn',
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
        label: 'Số nguồn kiểm định giá & review',
        renderValue: (p) => `${p.merchant_count || 0} nguồn`,
        numericValue: (p) => Number(p.merchant_count || 0),
        higherIsBetter: true,
      },
      {
        id: 'value_per_point',
        label: 'Hiệu suất Giá / Điểm JReviews (VND / 1.0 điểm thang 10)',
        renderValue: (p) => {
          const min = Number(p.min_price || 0);
          if (min <= 0) return '-';
          const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
          const e =
            p.expert_rating != null && Number(p.expert_rating) > 0
              ? Number(p.expert_rating) > 5
                ? Number(p.expert_rating)
                : Number(p.expert_rating) * 2
              : null;
          const combined10 =
            u != null && e != null
              ? u * 2 * 0.6 + e * 0.4
              : u != null
                ? u * 2
                : (e ?? 0);
          if (combined10 <= 0) return '-';
          const costPerPt = Math.round(min / combined10);
          return `${costPerPt.toLocaleString('vi-VN')} ₫ / điểm`;
        },
        numericValue: (p) => {
          const min = Number(p.min_price || 0);
          if (min <= 0) return null;
          const u = getEffectiveRating(p) > 0 ? getEffectiveRating(p) : null;
          const e =
            p.expert_rating != null && Number(p.expert_rating) > 0
              ? Number(p.expert_rating) > 5
                ? Number(p.expert_rating)
                : Number(p.expert_rating) * 2
              : null;
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
        label: 'Chi phí sở hữu quy đổi 24 tháng (VND / ngày)',
        renderValue: (p) => {
          const min = Number(p.min_price || 0);
          if (min <= 0) return '-';
          const daily = Math.round(min / 730);
          return `${daily.toLocaleString('vi-VN')} ₫ / ngày`;
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
    title: '1. Màn hình (Display)',
    icon: '📱',
    rows: [
      {
        id: 'display_size',
        label: 'Kích thước màn hình',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const size = specs.display?.size_inch ?? p.screen_size_inch;
          return size ? `${size}"` : '-';
        },
        numericValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const size = Number(
            specs.display?.size_inch ?? p.screen_size_inch ?? 0
          );
          return size > 0 ? size : null;
        },
        higherIsBetter: true,
      },
      {
        id: 'display_type',
        label: 'Công nghệ tấm nền',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const keySpecs = (p.key_specs || {}) as KeySpecs;
          return specs.display?.type || keySpecs.screen || '-';
        },
      },
      {
        id: 'display_resolution',
        label: 'Độ phân giải & Mật độ điểm ảnh',
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
        label: 'Tần số quét (Refresh Rate)',
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
        label: 'Kính bảo vệ & Tính năng hiển thị',
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
    title: '2. Hiệu năng & Phần cứng (Hardware)',
    icon: '⚡',
    rows: [
      {
        id: 'hw_chipset',
        label: 'Vi xử lý (Chipset)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const keySpecs = (p.key_specs || {}) as KeySpecs;
          return specs.hardware?.chipset || keySpecs.chip || '-';
        },
      },
      {
        id: 'hw_cpu_gpu',
        label: 'Nhân CPU & Đồ họa GPU',
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
        label: 'Dung lượng RAM',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const ram = p.ram_gb ?? specs.hardware?.ram_gb;
          return ram ? `${ram} GB` : '-';
        },
        numericValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const ram = Number(p.ram_gb ?? specs.hardware?.ram_gb ?? 0);
          return ram > 0 ? ram : null;
        },
        higherIsBetter: true,
      },
      {
        id: 'hw_storage',
        label: 'Bộ nhớ trong (ROM)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const rom = Number(p.storage_gb ?? specs.hardware?.storage_gb ?? 0);
          if (!rom) return '-';
          return rom >= 1024 ? `${rom / 1024} TB` : `${rom} GB`;
        },
        numericValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const rom = Number(p.storage_gb ?? specs.hardware?.storage_gb ?? 0);
          return rom > 0 ? rom : null;
        },
        higherIsBetter: true,
      },
      {
        id: 'hw_os_exp',
        label: 'Hệ điều hành & Khe thẻ nhớ',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const parts = [
            specs.hardware?.os,
            specs.hardware?.storage_expansion
              ? `Thẻ nhớ: ${specs.hardware.storage_expansion}`
              : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(' | ') : '-';
        },
      },
    ],
  },
  {
    id: 'camera',
    title: '3. Hệ thống Máy ảnh (Camera - Chuẩn PhoneArena)',
    icon: '📸',
    rows: [
      {
        id: 'cam_main',
        label: 'Camera chính (Main Camera)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const keySpecs = (p.key_specs || {}) as KeySpecs;
          return specs.camera?.main_camera || keySpecs.camera || '-';
        },
      },
      {
        id: 'cam_second',
        label: 'Camera thứ 2 (Góc siêu rộng / Phụ)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.camera?.second_camera || '-';
        },
      },
      {
        id: 'cam_third_fourth',
        label: 'Camera thứ 3 & thứ 4 (Tele / Periscope)',
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
        label: 'Quay video & Đèn Flash',
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
        label: 'Camera trước (Selfie)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.camera?.front_camera || '-';
        },
      },
    ],
  },
  {
    id: 'battery',
    title: '4. Pin & Công nghệ Sạc (Battery)',
    icon: '🔋',
    rows: [
      {
        id: 'bat_capacity',
        label: 'Dung lượng pin',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const mah = specs.battery?.capacity_mah ?? p.battery_mah;
          return mah ? `${mah} mAh` : '-';
        },
        numericValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const mah = Number(specs.battery?.capacity_mah ?? p.battery_mah ?? 0);
          return mah > 0 ? mah : null;
        },
        higherIsBetter: true,
      },
      {
        id: 'bat_fast_charge',
        label: 'Công suất sạc nhanh',
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
        label: 'Công nghệ pin, Sạc không dây & Sạc ngược',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const parts = [
            specs.battery?.type,
            specs.battery?.charging,
            specs.battery?.reverse_charging
              ? `Sạc ngược: ${formatBool(specs.battery.reverse_charging)}`
              : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(' | ') : '-';
        },
      },
    ],
  },
  {
    id: 'design',
    title: '5. Thiết kế & Độ bền (Design)',
    icon: '📐',
    rows: [
      {
        id: 'design_dim',
        label: 'Kích thước tổng thể',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.design?.dimensions || '-';
        },
      },
      {
        id: 'design_weight',
        label: 'Trọng lượng',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.design?.weight_g ? `${specs.design.weight_g} g` : '-';
        },
        numericValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.design?.weight_g ? Number(specs.design.weight_g) : null;
        },
        higherIsBetter: false,
      },
      {
        id: 'design_materials',
        label: 'Chất liệu khung & Mặt lưng',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.design?.materials || specs.design?.build || '-';
        },
      },
      {
        id: 'design_resistance',
        label: 'Chuẩn kháng nước & bụi (IP)',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.design?.resistance || '-';
        },
      },
      {
        id: 'design_bio_colors',
        label: 'Bảo mật sinh trắc học & Màu sắc',
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
            colors ? `Màu: ${colors}` : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(' | ') : '-';
        },
      },
    ],
  },
  {
    id: 'cellular',
    title: '6. Mạng Di động & SIM (Cellular)',
    icon: '📶',
    rows: [
      {
        id: 'cell_5g',
        label: 'Hỗ trợ mạng 5G',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const has5g = specs.cellular?.has_5g ?? p.has_5g;
          return has5g ? 'Có 5G' : '4G LTE';
        },
      },
      {
        id: 'cell_sim',
        label: 'Cấu hình SIM & Công nghệ mạng',
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
        label: 'Băng tần 5G / Tốc độ dữ liệu',
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
    title: '7. Kết nối Không dây & Cổng (Connectivity)',
    icon: '🌐',
    rows: [
      {
        id: 'conn_wlan_bt',
        label: 'Wi-Fi & Bluetooth',
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
        label: 'Thanh toán không chạm NFC',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return formatBool(specs.connectivity?.nfc);
        },
      },
      {
        id: 'conn_usb_gps',
        label: 'Cổng USB, Định vị & Cảm biến',
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
    title: '8. Âm thanh & Đa phương tiện (Multimedia)',
    icon: '🔊',
    rows: [
      {
        id: 'mm_speaker',
        label: 'Hệ thống loa ngoài',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          return specs.multimedia?.loudspeaker || 'Loa kép Stereo';
        },
      },
      {
        id: 'mm_jack_audio',
        label: 'Giắc tai nghe 3.5mm & Chuẩn âm thanh',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const jack =
            specs.multimedia?.headphone_jack_35mm !== undefined
              ? `3.5mm: ${formatBool(specs.multimedia.headphone_jack_35mm)}`
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
    title: '9. Thời điểm Ra mắt & Giá Khởi điểm (Availability)',
    icon: '📅',
    rows: [
      {
        id: 'avail_announced',
        label: 'Thời điểm công bố & Trạng thái',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const parts = [
            specs.availability?.announced,
            specs.availability?.status,
          ].filter(Boolean);
          return parts.length > 0
            ? parts.join(' | ')
            : 'Đang mở bán chính hãng';
        },
      },
      {
        id: 'avail_msrp',
        label: 'Giá niêm yết gốc (MSRP) & Mã Model',
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
    title: '10. Chứng nhận & An toàn Pháp lý (Regulatory)',
    icon: '🛡️',
    rows: [
      {
        id: 'reg_cert',
        label: 'Chứng nhận chất lượng & Mức bức xạ SAR',
        renderValue: (p) => {
          const specs = (p.specifications || {}) as ProductSpecifications;
          const parts = [
            specs.regulatory?.certifications,
            specs.regulatory?.fcc_approval,
            specs.regulatory?.sar_head
              ? `SAR đầu: ${specs.regulatory.sar_head}`
              : null,
            specs.regulatory?.sar_body
              ? `SAR thân: ${specs.regulatory.sar_body}`
              : null,
          ].filter(Boolean);
          return parts.length > 0
            ? parts.join(' | ')
            : 'Đạt chuẩn hợp quy Bộ TT&TT Việt Nam';
        },
      },
    ],
  },
];

export default function CompareWorkspace({
  initialProducts,
  catalogCandidates,
  initialCategory = 'smartphones',
  hasExplicitSlugs = false,
  locale = 'vi',
}: CompareWorkspaceProps) {
  const router = useRouter();
  const specDict = useMemo(() => getSpecUiDictionary(locale), [locale]);
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
      CATEGORY_TABS.find((t) => t.slug === activeCategory) || CATEGORY_TABS[0]!,
    [activeCategory]
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

    // Otherwise sync the active comparison into the tray
    if (initialProducts.length > 0) {
      const primaryCat = getMasterProductCategorySlug(initialProducts[0]!);
      const sameCatInitial = initialProducts.filter(
        (p) => getMasterProductCategorySlug(p) === primaryCat
      );
      setCompareTray(
        sameCatInitial.map((p) => ({
          slug: p.slug,
          name: p.name,
          brand: p.brand,
          thumbnail: resolveProductImageUrl(
            p.slug,
            p.thumbnail ||
              (p.images && p.images.length > 0 ? p.images[0] || null : null)
          ),
          min_price: Number(p.min_price || 0),
          categorySlug: primaryCat,
        }))
      );
    }
  }, [hasExplicitSlugs, catalogCandidates, initialProducts, router]);

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
      const headerCols = [
        'Tiêu chí / Thông số',
        ...products.map((p) => p.name),
      ];
      const sepCols = headerCols.map(() => '---');
      const lines: string[] = [
        `### 📊 Báo Cáo Đối Chiếu ${activeCategoryMeta.label} - Rate.vn`,
        `- **Đường dẫn kiểm định:** ${window.location.href}`,
        '',
        `| ${headerCols.join(' | ')} |`,
        `| ${sepCols.join(' | ')} |`,
        `| **Điểm Người Mua Thực Chất** | ${products
          .map((p) => {
            const r = getEffectiveRating(p);
            const cnt = p.authentic_review_count || p.total_reviews || 0;
            return r > 0 ? `★ ${r.toFixed(1)}/5.0 (${cnt} review)` : 'chưa có';
          })
          .join(' | ')} |`,
        `| **Điểm Chuyên Gia Rate Lab** | ${products
          .map((p) =>
            p.expert_rating && Number(p.expert_rating) > 0
              ? `Lab ${Number(p.expert_rating).toFixed(1)}/5.0`
              : 'chưa có'
          )
          .join(' | ')} |`,
        `| **Giá Tham Khảo Thấp Nhất** | ${products
          .map((p) =>
            Number(p.min_price) > 0
              ? `${Number(p.min_price).toLocaleString('vi-VN')} ₫`
              : '-'
          )
          .join(' | ')} |`,
        `| **Tín Hiệu Deal Radar 60N** | ${products
          .map((p) => radarMarkdownCell(getRadarSignal(radarIndex, p.slug)))
          .join(' | ')} |`,
        `| **Cấu Hình / Bộ Nhớ** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            const parts = [
              ks.chip,
              p.ram_gb ? `${p.ram_gb}GB RAM` : ks.ram,
              p.storage_gb ? `${p.storage_gb}GB` : ks.storage,
            ].filter(Boolean);
            return parts.length > 0 ? parts.join(' / ') : '-';
          })
          .join(' | ')} |`,
        `| **Pin & Năng Lượng** | ${products
          .map((p) => {
            const ks = (p.key_specs || {}) as KeySpecs;
            return p.battery_mah ? `${p.battery_mah} mAh` : ks.battery || '-';
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
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headers = [
      'Nhóm Thông Số',
      'Tiêu Chí Kỹ Thuật',
      ...products.map((p) => p.name),
    ];
    const productRadarCells = products.map((p) =>
      radarCsvCells(getRadarSignal(radarIndex, p.slug))
    );
    const rows: string[] = [
      headers.map(escapeCsv).join(','),
      [
        '0. Tín hiệu Deal Radar 10 Sàn (60N)',
        'Phán quyết & Độ lệch giá',
        ...products.map((p) => radarLabel(getRadarSignal(radarIndex, p.slug))),
      ]
        .map((c) => escapeCsv(c))
        .join(','),
      ...RADAR_CSV_HEADERS.map((hdr, idx) =>
        [
          '0. Tín hiệu Deal Radar 10 Sàn (60N)',
          hdr,
          ...productRadarCells.map((cells) => cells[idx] ?? ''),
        ]
          .map((c) => escapeCsv(c))
          .join(',')
      ),
    ];
    for (const group of SPEC_GROUPS) {
      for (const row of group.rows) {
        const vals = products.map((p) => row.renderValue(p));
        if (vals.every((v) => !v || v === '-')) continue;
        rows.push(
          [group.title, row.label, ...vals].map((c) => escapeCsv(c)).join(',')
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
        const e =
          p.expert_rating != null && Number(p.expert_rating) > 0
            ? Number(p.expert_rating)
            : null;
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
      matrix: SPEC_GROUPS.map((group) => ({
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
    const byRating = [...products].sort(
      (a, b) => getEffectiveRating(b) - getEffectiveRating(a)
    );
    const byPrice = [...products]
      .filter((p) => Number(p.min_price || 0) > 0)
      .sort((a, b) => Number(a.min_price || 0) - Number(b.min_price || 0));
    const byMemory = [...products].sort(
      (a, b) =>
        Number(b.ram_gb || 0) * 1000 +
        Number(b.storage_gb || 0) -
        (Number(a.ram_gb || 0) * 1000 + Number(a.storage_gb || 0))
    );
    const byBattery = [...products].sort(
      (a, b) => Number(b.battery_mah || 0) - Number(a.battery_mah || 0)
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
            Danh mục đang khóa đối chiếu (chỉ so sánh các thiết bị cùng loại):
          </div>
          <div
            className="d-flex flex-wrap gap-2"
            role="tablist"
            aria-label="Chọn danh mục đối chiếu"
          >
            {CATEGORY_TABS.map((tab) => {
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
                  {tab.label}{' '}
                  <span className="rate-tabular opacity-75">({count})</span>
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
                ? `Đang chọn ${activeCategoryMeta.unitLabel} thay thế cho "${products[replaceIndex]?.name}"`
                : `Tìm & Thêm ${activeCategoryMeta.label} Vào Bảng So Sánh (${products.length}/${MAX_COMPARE_ITEMS})`}
            </label>
            <div className="position-relative">
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0 rounded-start-pill ps-3">
                  🔎
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
                      ? 'Đã đủ 4 thiết bị tối đa - Hãy xóa bớt hoặc bấm "Đổi máy" ở cột dưới'
                      : `Gõ tên ${activeCategoryMeta.unitLabel} cùng danh mục để đối chiếu...`
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
                    Hủy đổi
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
                          ? `Kết quả ${activeCategoryMeta.label} cho "${searchQuery.trim()}"`
                          : `Danh sách ${activeCategoryMeta.unitLabel} cùng danh mục`}
                      </span>
                      {isSearching && (
                        <span className="badge bg-secondary rounded-pill small">
                          Đang tìm...
                        </span>
                      )}
                    </div>

                    {suggestions.length === 0 ? (
                      <div className="text-muted small p-4 text-center">
                        Không tìm thấy {activeCategoryMeta.unitLabel} khớp với
                        từ khóa &quot;
                        {searchQuery}&quot;.
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
                                        : 'chưa có'}
                                    </span>
                                    <span
                                      className="text-secondary fw-semibold rate-tabular"
                                      style={{ fontSize: '12px' }}
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
                                  ? 'Đang so sánh'
                                  : replaceIndex !== null
                                    ? 'Chọn thay thế'
                                    : '+ Thêm vào bàn cân'}
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
                  Chỉ hiện điểm khác biệt
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
                  Tô sáng thông số vượt trội
                </label>
              </div>

              <button
                type="button"
                onClick={handleCopyShareLink}
                className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
              >
                {copiedLink ? '✓ Đã sao chép link!' : 'Sao chép link so sánh'}
              </button>

              {products.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyMarkdownReport}
                    className="btn btn-sm btn-outline-danger rounded-pill fw-medium px-3 py-2"
                  >
                    {copiedMarkdown
                      ? '✓ Đã sao chép Markdown!'
                      : '📋 Sao chép bảng Markdown'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareCsv}
                    data-testid="compare-export-csv-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    📥 CSV ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCompareJson}
                    data-testid="compare-export-json-btn"
                    className="btn btn-sm btn-outline-dark rounded-pill fw-medium px-3 py-2"
                  >
                    📦 JSON ({products.length})
                  </button>
                </>
              )}

              {products.length === 2 && products[0] && products[1] && (
                <Link
                  href={`/compare/${products[0].slug}-vs-${products[1].slug}`}
                  className="btn btn-sm btn-dark rounded-pill fw-medium px-3 py-2"
                >
                  ⚡ Trang 1v1 chuyên sâu
                </Link>
              )}

              {products.length > 0 && (
                <button
                  type="button"
                  onClick={handleWatchAllCompared}
                  className="btn btn-sm btn-outline-secondary rounded-pill fw-medium px-3 py-2"
                >
                  {watchedAllToast
                    ? '✓ Đã lưu Watchlist!'
                    : `Theo dõi cả nhóm (${products.length})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Preset Chips strictly from Same Category */}
        {categoryLockedCandidates.length >= 2 && (
          <div className="d-flex align-items-center border-top mt-3 flex-wrap gap-2 pt-3">
            <span className="small text-muted fw-medium me-1">
              Thêm nhanh {activeCategoryMeta.unitLabel} cùng danh mục:
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
                Kèo Đối Đầu 1v1 Tiêu Điểm ({activeCategoryMeta.label})
              </div>
              <h2 className="h6 fw-bold text-dark mb-0">
                Các Cặp So Kè Trực Tiếp Được Tìm Kiếm Nhiều Nhất Trong Nhóm{' '}
                {activeCategoryMeta.label}
              </h2>
            </div>
            <Link
              href={`/leaderboard?cat=${activeCategory}`}
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
            >
              Xem Bảng Xếp Hạng {activeCategoryMeta.label} →
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
                      <span className="badge bg-danger-subtle text-danger rounded-pill small font-monospace">
                        Chênh {battle.scoreDelta5.toFixed(2)} đ
                      </span>
                    </div>

                    <div className="d-flex align-items-center justify-content-between my-2 gap-2">
                      <div className="d-flex align-items-center gap-2 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
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
                          <div className="small text-secondary font-monospace">
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
                          <div className="small text-secondary font-monospace">
                            ★ {battle.productB.combinedScore5.toFixed(2)}
                          </div>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
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
                      Nạp vào bàn cân
                    </button>
                    <Link
                      href={battle.versusHref}
                      className="btn btn-sm btn-dark rounded-pill small fw-semibold px-3"
                    >
                      So kè 1v1 →
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
                  backgroundColor: 'rgba(16, 185, 129, 0.16)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                Chấm điểm Đối đầu ({activeCategoryMeta.label})
              </span>
              <span className="fw-bold text-white">
                Tóm Tắt Ưu Thế Giữa {products.length} {activeCategoryMeta.label}{' '}
                Đang So Sánh
              </span>
            </div>
            <Link
              href={`/${activeCategory}`}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
            >
              Xem toàn bộ {activeCategoryMeta.label} →
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
                    Điểm Đánh Giá Thực Chất Cao Nhất
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestRated.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    ★{' '}
                    {getEffectiveRating(headToHeadSummary.bestRated).toFixed(1)}{' '}
                    / 5.0 (đã lọc Seeding AI)
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
                    Cấu Hình Phần Cứng Nổi Bật
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.highestMemory.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {headToHeadSummary.highestMemory.ram_gb
                      ? `${headToHeadSummary.highestMemory.ram_gb}GB RAM - `
                      : ''}
                    {headToHeadSummary.highestMemory.storage_gb
                      ? `${headToHeadSummary.highestMemory.storage_gb}GB`
                      : 'Chuẩn hóa 10 nhóm'}
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
                    Thời Lượng Pin &amp; Năng Lượng
                  </div>
                  <div className="fw-bold text-truncate text-white">
                    {headToHeadSummary.bestBattery.name}
                  </div>
                  <div className="small text-white-50 rate-tabular">
                    {headToHeadSummary.bestBattery.battery_mah
                      ? `${headToHeadSummary.bestBattery.battery_mah} mAh`
                      : 'Chuẩn hóa 10 nhóm'}
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
                    Giá Tham Khảo Thấp Nhất Cùng Nhóm
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
            Chưa có {activeCategoryMeta.unitLabel} nào trong bảng đối chiếu
          </h4>
          <p className="text-muted mb-4">
            Hãy gõ tìm kiếm ở thanh công cụ phía trên hoặc bấm chọn nhanh một
            trong các {activeCategoryMeta.unitLabel} bên dưới để bắt đầu đối
            chiếu.
          </p>
          <div className="d-flex justify-content-center flex-wrap gap-2">
            {categoryLockedCandidates.slice(0, 3).map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => handleSelectCandidate(c)}
                className="btn btn-dark rounded-pill px-4"
              >
                + Thêm {c.name}
              </button>
            ))}
            <Link
              href={`/${activeCategory}`}
              className="btn btn-outline-secondary rounded-pill px-4"
            >
              Xem danh mục {activeCategoryMeta.label}
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
                      Điểm Đánh Giá &amp; 10 Nhóm Thông Số
                    </div>
                    <div
                      className="text-muted fw-normal"
                      style={{ fontSize: '12px' }}
                    >
                      Chuẩn JReviews &amp; PhoneArena ({products.length}{' '}
                      {activeCategoryMeta.unitLabel})
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
                    const expertRating =
                      p.expert_rating && Number(p.expert_rating) > 0
                        ? Number(p.expert_rating)
                        : null;
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
                            title={`Đổi sang ${activeCategoryMeta.unitLabel} khác`}
                          >
                            Đổi máy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProduct(p.slug)}
                            className="btn btn-sm btn-outline-secondary rounded-circle d-inline-flex align-items-center justify-content-center p-0"
                            style={{
                              width: '24px',
                              height: '24px',
                              lineHeight: 1,
                            }}
                            title="Xóa khỏi bảng so sánh"
                            aria-label={`Xóa ${p.name}`}
                          >
                            ×
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
                                : 'chưa có'}
                            </span>
                            {expertRating != null && (
                              <span className="rate-score-badge-expert">
                                Lab {expertRating.toFixed(1)}
                              </span>
                            )}
                          </div>

                          {/* Neutral Reference Price */}
                          <div className="text-secondary small fw-semibold rate-tabular mb-2">
                            Giá tham khảo:{' '}
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
                              Đọc Review &amp; Chấm điểm
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
                          title={`Thêm ${activeCategoryMeta.unitLabel} cùng danh mục`}
                        >
                          +
                        </button>
                        <div className="fw-bold small text-dark mb-1">
                          Thêm {activeCategoryMeta.label}
                        </div>
                        <div
                          className="text-muted fw-normal"
                          style={{ fontSize: '12px' }}
                        >
                          Còn trống {MAX_COMPARE_ITEMS - products.length} vị trí
                          cùng nhóm
                        </div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                <tr data-testid="compare-radar-row">
                  <td className="text-muted small fw-semibold bg-light text-start">
                    🔥 Tín hiệu Radar Kèo Đáy &amp; Bẫy Sale 10 Sàn (60N)
                  </td>
                  {products.map((p) => {
                    const sig = getRadarSignal(radarIndex, p.slug);
                    if (sig.verdict === 'none') {
                      return (
                        <td
                          key={`radar-${p.id}`}
                          className="small text-secondary"
                        >
                          ⚖️ Ổn định quanh trung vị 60N
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
                          ? `🔥 Đáy giá thật 60N (-${sig.savingsPct.toFixed(1)}% so với trung vị • ${(sig.genuineDeal?.platform ?? '').toUpperCase()})`
                          : `🚨 Cảnh báo Nâng Giá Sale Ảo (+${sig.fakeMarkupPct.toFixed(1)}% so với trung vị)`}
                      </td>
                    );
                  })}
                  {products.length < MAX_COMPARE_ITEMS && (
                    <td className="bg-light text-muted small">-</td>
                  )}
                </tr>
                {SPEC_GROUPS.map((group) => {
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
                      : locale === 'en'
                        ? '0. Multi-Dimensional Ratings & Market Trust (JReviews Core)'
                        : locale === 'cs'
                          ? '0. Víceúrovňové hodnocení a důvěryhodnost (JReviews Core)'
                          : group.title;

                  return (
                    <React.Fragment key={group.id}>
                      <tr className="table-secondary fw-bold text-start">
                        <td colSpan={totalCols} className="px-3 py-2">
                          <span className="me-2">{group.icon}</span>
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
                                  {textVal}
                                  {isWinner && (
                                    <span
                                      className="badge bg-success rounded-pill ms-1 text-white"
                                      style={{ fontSize: '10px' }}
                                    >
                                      {locale === 'en'
                                        ? 'Best'
                                        : locale === 'cs'
                                          ? 'Nejlepší'
                                          : 'Tốt nhất'}
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
