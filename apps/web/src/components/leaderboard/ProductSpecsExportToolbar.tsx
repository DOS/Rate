'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  specFieldApplies,
  type CategorySpecTemplate,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';

const SPEC_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeSpecExportText(
  value: unknown,
  fallback = '',
  maxLen = 240
): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(SPEC_CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function formatPositiveSpecMetric(
  value: unknown,
  suffix: string,
  maxVal = 1_000_000
): string | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > maxVal) return null;
  const rounded = Number(num.toFixed(2));
  return `${rounded}${suffix}`;
}

export function sanitizeSpecDownloadSlug(
  value: unknown,
  fallback = 'product'
): string {
  if (typeof value !== 'string') return fallback;
  const slug = value
    .replace(SPEC_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function joinSpecParts(parts: Array<string | null | undefined>): string {
  const valid = parts
    .map((p) => (p ? sanitizeSpecExportText(p, '', 160) : ''))
    .filter(Boolean);
  return valid.join(' | ') || '-';
}

type SpecExportRow = [string, string, string];

// The template group each row reads, and the fields that make it a row the
// category has (any one of them is enough).
const EXPORT_ROW_FIELDS: ReadonlyArray<[SpecGroupKey, readonly string[]]> = [
  ['display', ['size_inch', 'type', 'refresh_rate_hz']],
  ['display', ['resolution', 'protection']],
  ['hardware', ['chipset', 'cpu', 'gpu']],
  ['hardware', ['ram_gb', 'storage_gb', 'os']],
  ['camera', ['main_camera']],
  ['camera', ['video_recording', 'front_camera']],
  ['battery', ['capacity_mah']],
  ['design', ['dimensions', 'weight_g', 'resistance']],
  ['cellular', ['technology', 'sim_type', 'data_speed']],
  ['connectivity', ['wlan', 'bluetooth', 'usb']],
  ['multimedia', ['loudspeaker', 'audio_features']],
  ['availability', ['announced']],
  ['regulatory', ['certifications']],
];

const exportRowApplies = (
  template: CategorySpecTemplate,
  index: number
): boolean => {
  const entry = EXPORT_ROW_FIELDS[index];
  // A row added without an entry stays visible rather than vanishing.
  if (!entry) return true;
  const [group, fields] = entry;
  return fields.some((field) => specFieldApplies(template, group, field));
};

/**
 * The spec rows a product exports. With a category, only the rows and values
 * its spec template has, as on the product page: no screen, RAM, ROM or
 * camera for earbuds and no 5G for a watch (DOS/Rate#1166).
 */
export function buildProductSpecExportRows(
  specifications?: ProductSpecifications | null,
  keySpecs?: KeySpecs | null,
  categorySlug?: string | null
): SpecExportRow[] {
  const scoped = applyCategorySpecTemplate(categorySlug, {
    specifications: specifications ?? {},
    key_specs: keySpecs ?? {},
  });
  const template = getCategorySpecTemplate(categorySlug);
  const specs = (scoped.specifications ?? {}) as ProductSpecifications;
  const keys = (scoped.key_specs ?? {}) as KeySpecs;
  const rows: SpecExportRow[] = [
    [
      '1. Display',
      'Size & Panel',
      joinSpecParts([
        formatPositiveSpecMetric(specs.display?.size_inch, '"', 100),
        specs.display?.type || keys.screen || null,
        formatPositiveSpecMetric(specs.display?.refresh_rate_hz, 'Hz', 1000),
      ]),
    ],
    [
      '1. Display',
      'Resolution & Protection',
      joinSpecParts([
        specs.display?.resolution || null,
        specs.display?.protection || null,
      ]),
    ],
    [
      '2. Hardware',
      'Chipset & CPU/GPU',
      joinSpecParts([
        specs.hardware?.chipset || keys.chip || null,
        specs.hardware?.cpu || null,
        specs.hardware?.gpu || null,
      ]),
    ],
    [
      '2. Hardware',
      'Memory & OS',
      joinSpecParts([
        formatPositiveSpecMetric(specs.hardware?.ram_gb, 'GB RAM', 2048) ||
          keys.ram ||
          null,
        formatPositiveSpecMetric(specs.hardware?.storage_gb, 'GB ROM', 65536) ||
          keys.storage ||
          null,
        specs.hardware?.os || null,
      ]),
    ],
    [
      '3. Camera',
      'Main & Multi-Camera',
      joinSpecParts([
        specs.camera?.main_camera || keys.camera || null,
        specs.camera?.second_camera || null,
        specs.camera?.third_camera || null,
      ]),
    ],
    [
      '3. Camera',
      'Video & Front Camera',
      joinSpecParts([
        specs.camera?.video_recording || null,
        specs.camera?.front_camera || null,
      ]),
    ],
    [
      '4. Battery',
      'Capacity & Fast Charging',
      joinSpecParts([
        formatPositiveSpecMetric(
          specs.battery?.capacity_mah,
          ' mAh',
          200_000
        ) ||
          keys.battery ||
          null,
        formatPositiveSpecMetric(specs.battery?.fast_charging_w, 'W', 2000),
        specs.battery?.charging || null,
      ]),
    ],
    [
      '5. Design',
      'Dimensions, Weight & IP Rating',
      joinSpecParts([
        specs.design?.dimensions || null,
        formatPositiveSpecMetric(specs.design?.weight_g, 'g', 50_000),
        specs.design?.resistance || null,
      ]),
    ],
    [
      '6. Cellular',
      'Network & SIM',
      joinSpecParts([
        specs.cellular?.technology || null,
        specs.cellular?.sim_type || null,
        specs.cellular?.data_speed || null,
      ]),
    ],
    [
      '7. Connectivity',
      'WLAN, Bluetooth & USB',
      joinSpecParts([
        specs.connectivity?.wlan || null,
        specs.connectivity?.bluetooth || null,
        specs.connectivity?.usb || null,
      ]),
    ],
    [
      '8. Multimedia',
      'Audio & Speakers',
      joinSpecParts([
        specs.multimedia?.loudspeaker || null,
        specs.multimedia?.audio_features || null,
      ]),
    ],
    [
      '9. Availability',
      'Release & MSRP',
      joinSpecParts([
        specs.availability?.announced || null,
        specs.availability?.status || null,
        specs.availability?.prices_msrp || null,
      ]),
    ],
    [
      '10. Regulatory',
      'Certifications & SAR',
      joinSpecParts([
        specs.regulatory?.certifications || null,
        specs.regulatory?.fcc_approval || null,
        specs.regulatory?.sar_head || null,
        specs.regulatory?.sar_body || null,
      ]),
    ],
  ];
  return rows.filter((_, index) => exportRowApplies(template, index));
}

interface ProductSpecsExportToolbarProps {
  readonly productName: string;
  readonly productSlug: string;
  readonly brand: string;
  readonly specifications: ProductSpecifications;
  readonly keySpecs: KeySpecs;
  /** Scopes the rows and the JSON to the category's spec template. */
  readonly categorySlug?: string | null;
  readonly radarSignal?: RadarSignal | null;
}

export default function ProductSpecsExportToolbar({
  productName,
  productSlug,
  brand,
  specifications,
  keySpecs,
  categorySlug,
  radarSignal,
}: ProductSpecsExportToolbarProps) {
  const t = useTranslations('productDetail');
  const [copiedSpecsMd, setCopiedSpecsMd] = useState(false);

  const safeProductName = sanitizeSpecExportText(productName, 'Unknown', 160);
  const safeBrand = sanitizeSpecExportText(brand, '-', 80);
  const safeSlug = sanitizeSpecDownloadSlug(productSlug, 'product');

  const handleCopySpecsMarkdown = async () => {
    if (typeof navigator === 'undefined') return;
    const rows = buildProductSpecExportRows(
      specifications,
      keySpecs,
      categorySlug
    );

    const md = [
      `### 📋 Rate.vn Technical Specifications: ${safeProductName} (${safeBrand})`,
      `- **Price signal:** ${radarMarkdownCell(radarSignal)}`,
      '',
      '| Field Group | Attribute | Specification |',
      '| --- | --- | --- |',
      ...rows.map(
        ([grp, attr, val]) =>
          `| ${grp} | ${attr} | ${val.replace(/\|/g, '/')} |`
      ),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopiedSpecsMd(true);
      setTimeout(() => setCopiedSpecsMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadSpecsCsv = () => {
    if (typeof document === 'undefined') return;
    const rows = buildProductSpecExportRows(
      specifications,
      keySpecs,
      categorySlug
    );
    const headers = [
      'Slug',
      'Product',
      'Brand',
      ...RADAR_CSV_HEADERS,
      'FieldGroup',
      'Attribute',
      'Value',
    ];
    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map(([grp, attr, val]) =>
        [
          safeSlug,
          safeProductName,
          safeBrand,
          ...radarCsvCells(radarSignal),
          grp,
          attr,
          val,
        ]
          .map(escapeCsvCell)
          .join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-specs-${safeSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSpecsJson = () => {
    if (typeof document === 'undefined') return;
    const scoped = applyCategorySpecTemplate(categorySlug, {
      specifications,
      key_specs: keySpecs,
    });
    const payload = {
      slug: safeSlug,
      name: safeProductName,
      brand: safeBrand,
      schema: 'Rate.vn spec field groups (GSMArena + PhoneArena)',
      exported_at: new Date().toISOString(),
      deal_radar: radarExportFields(radarSignal),
      key_specs: scoped.key_specs,
      specifications: scoped.specifications,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-specs-${safeSlug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-flex align-items-center flex-wrap gap-2">
      <ExportMenu label={t('exportMenu')}>
        {(close) => (
          <>
            <button
              type="button"
              onClick={handleCopySpecsMarkdown}
              data-testid="copy-specs-md-btn"
            >
              {copiedSpecsMd
                ? t('specsToolbarCopiedMd')
                : t('specsToolbarCopyMd')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadSpecsCsv();
                close();
              }}
              data-testid="download-specs-csv-btn"
            >
              {t('specsToolbarExportCsv')}
            </button>
            <button
              type="button"
              onClick={() => {
                handleDownloadSpecsJson();
                close();
              }}
              data-testid="download-specs-json-btn"
            >
              {t('specsToolbarExportJson')}
            </button>
          </>
        )}
      </ExportMenu>
    </div>
  );
}
