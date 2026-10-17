'use client';

import { useState } from 'react';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';

interface ProductSpecsExportToolbarProps {
  readonly productName: string;
  readonly productSlug: string;
  readonly brand: string;
  readonly specifications: ProductSpecifications;
  readonly keySpecs: KeySpecs;
  readonly radarSignal?: RadarSignal | null;
}

export default function ProductSpecsExportToolbar({
  productName,
  productSlug,
  brand,
  specifications,
  keySpecs,
  radarSignal,
}: ProductSpecsExportToolbarProps) {
  const [copiedSpecsMd, setCopiedSpecsMd] = useState(false);

  const buildSpecRows = (): Array<[string, string, string]> => [
    [
      '1. Display',
      'Size & Panel',
      [
        specifications.display?.size_inch
          ? `${specifications.display.size_inch}"`
          : null,
        specifications.display?.type || keySpecs.screen || null,
        specifications.display?.refresh_rate_hz
          ? `${specifications.display.refresh_rate_hz}Hz`
          : null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '1. Display',
      'Resolution & Protection',
      [
        specifications.display?.resolution || null,
        specifications.display?.protection || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '2. Hardware',
      'Chipset & CPU/GPU',
      [
        specifications.hardware?.chipset || keySpecs.chip || null,
        specifications.hardware?.cpu || null,
        specifications.hardware?.gpu || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '2. Hardware',
      'Memory & OS',
      [
        specifications.hardware?.ram_gb
          ? `${specifications.hardware.ram_gb}GB RAM`
          : keySpecs.ram || null,
        specifications.hardware?.storage_gb
          ? `${specifications.hardware.storage_gb}GB ROM`
          : keySpecs.storage || null,
        specifications.hardware?.os || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '3. Camera',
      'Main & Multi-Camera',
      [
        specifications.camera?.main_camera || keySpecs.camera || null,
        specifications.camera?.second_camera || null,
        specifications.camera?.third_camera || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '3. Camera',
      'Video & Front Camera',
      [
        specifications.camera?.video_recording || null,
        specifications.camera?.front_camera || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '4. Battery',
      'Capacity & Fast Charging',
      [
        specifications.battery?.capacity_mah
          ? `${specifications.battery.capacity_mah} mAh`
          : keySpecs.battery || null,
        specifications.battery?.fast_charging_w
          ? `${specifications.battery.fast_charging_w}W`
          : null,
        specifications.battery?.charging || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '5. Design',
      'Dimensions, Weight & IP Rating',
      [
        specifications.design?.dimensions || null,
        specifications.design?.weight_g
          ? `${specifications.design.weight_g}g`
          : null,
        specifications.design?.resistance || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '6. Cellular',
      'Network & SIM',
      [
        specifications.cellular?.technology || null,
        specifications.cellular?.sim_type || null,
        specifications.cellular?.data_speed || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '7. Connectivity',
      'WLAN, Bluetooth & USB',
      [
        specifications.connectivity?.wlan || null,
        specifications.connectivity?.bluetooth || null,
        specifications.connectivity?.usb || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '8. Multimedia',
      'Audio & Speakers',
      [
        specifications.multimedia?.loudspeaker || null,
        specifications.multimedia?.audio_features || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '9. Availability',
      'Release & MSRP',
      [
        specifications.availability?.announced || null,
        specifications.availability?.status || null,
        specifications.availability?.prices_msrp || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
    [
      '10. Regulatory',
      'Certifications & SAR',
      [
        specifications.regulatory?.certifications || null,
        specifications.regulatory?.fcc_approval || null,
        specifications.regulatory?.sar_head || null,
        specifications.regulatory?.sar_body || null,
      ]
        .filter(Boolean)
        .join(' | ') || '-',
    ],
  ];

  const handleCopySpecsMarkdown = async () => {
    if (typeof navigator === 'undefined') return;
    const rows = buildSpecRows();

    const md = [
      `### 📋 Rate.vn 10-Field-Groups Technical Specifications: ${productName} (${brand})`,
      `- **Deal Radar Signal:** ${radarMarkdownCell(radarSignal)}`,
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
    const rows = buildSpecRows();
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
          productSlug,
          productName,
          brand,
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
    a.download = `rate-specs-${productSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSpecsJson = () => {
    if (typeof document === 'undefined') return;
    const payload = {
      slug: productSlug,
      name: productName,
      brand,
      schema: 'Rate.vn 10-Field-Groups (GSMArena + PhoneArena)',
      exported_at: new Date().toISOString(),
      deal_radar: radarExportFields(radarSignal),
      key_specs: keySpecs,
      specifications,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-specs-${productSlug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="d-flex align-items-center flex-wrap gap-2">
      <button
        type="button"
        onClick={handleCopySpecsMarkdown}
        className="btn btn-sm btn-outline-dark rounded-pill fw-semibold px-3 py-1"
        data-testid="copy-specs-md-btn"
      >
        {copiedSpecsMd
          ? '✅ Đã chép 10 nhóm thông số!'
          : '📋 Sao chép 10 nhóm thông số MD'}
      </button>
      <button
        type="button"
        onClick={handleDownloadSpecsCsv}
        className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
        data-testid="download-specs-csv-btn"
      >
        📥 Xuất CSV thông số
      </button>
      <button
        type="button"
        onClick={handleDownloadSpecsJson}
        className="btn btn-sm btn-outline-secondary rounded-pill fw-semibold px-3 py-1"
        data-testid="download-specs-json-btn"
      >
        📦 Xuất JSON thông số
      </button>
    </div>
  );
}
