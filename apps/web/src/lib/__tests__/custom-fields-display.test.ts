import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_CUSTOM_FIELD_ORDER,
  CUSTOM_FIELD_METADATA,
  buildCustomFieldDisplayRows,
  buildCustomFieldExportRows,
  customFieldHigherIsBetter,
  customFieldLabel,
  customFieldsGroupHeading,
  customFieldsSectionEyebrow,
  humanizeCustomFieldKey,
  orderCustomFieldKeys,
} from '../custom-fields-display';
import { NBSP } from '../locale-format';
import { compareRowIsShown } from '../product-spec-rows';
import { compareCellSegments, plainCompareCell } from '../compare-cell';
import { buildProductSpecExportRows } from '../../components/leaderboard/ProductSpecsExportToolbar';
import type { MasterProduct } from '@repo/shared-data';

const ALL_14_CATEGORIES = [
  'air-conditioners',
  'refrigerators',
  'washing-machines',
  'tvs',
  'air-purifiers',
  'bank-savings',
  'internet-telecom',
  'credit-cards',
  'vps-hosting',
  'cosmetics',
  'mother-baby',
  'supplements',
  'monitors',
  'cameras',
] as const;

async function main() {
  console.warn('🧪 Category custom_fields display & compare suite (#1980)');

  // 1. Dictionary completeness: 14 categories, 76 canonical keys, zero em/en-dashes.
  assert.equal(Object.keys(CATEGORY_CUSTOM_FIELD_ORDER).length, 14);
  const allCanonicalKeys = new Set<string>();
  for (const slug of ALL_14_CATEGORIES) {
    const keys = CATEGORY_CUSTOM_FIELD_ORDER[slug];
    assert.ok(
      keys && keys.length >= 4,
      `Missing canonical key order for ${slug}`
    );
    for (const k of keys) {
      allCanonicalKeys.add(k);
      assert.ok(
        Object.hasOwn(CUSTOM_FIELD_METADATA, k),
        `Missing metadata entry for canonical key ${k} (${slug})`
      );
    }
  }
  assert.equal(allCanonicalKeys.size, 76);
  assert.equal(Object.keys(CUSTOM_FIELD_METADATA).length, 76);

  for (const [key, meta] of Object.entries(CUSTOM_FIELD_METADATA)) {
    for (const locale of ['vi', 'en', 'cs'] as const) {
      const label = meta.labels[locale];
      assert.ok(label && label.trim().length > 0, `${key}.${locale} label`);
      assert.doesNotMatch(
        label,
        /[\u2013\u2014]|&\x6ddash;/,
        `${key}.${locale} must not contain en/em-dash`
      );
    }
  }

  // 2. Group headings & section eyebrow invariants (#1529, no leading digit, no `(` in VI).
  for (const locale of ['vi', 'en', 'cs'] as const) {
    const eyebrow = customFieldsSectionEyebrow(locale);
    assert.ok(eyebrow.length > 0);
    assert.doesNotMatch(eyebrow, /[\u2013\u2014]|&\x6ddash;/);
    for (const slug of [...ALL_14_CATEGORIES, 'unknown-cat', '']) {
      const heading = customFieldsGroupHeading(locale, slug);
      assert.ok(heading.length > 0, `${locale} heading for ${slug}`);
      assert.doesNotMatch(
        heading,
        /^\d/,
        `${locale} heading starts with digit: ${heading}`
      );
      assert.doesNotMatch(heading, /[\u2013\u2014]|&\x6ddash;/);
      if (locale === 'vi') {
        assert.doesNotMatch(
          heading,
          /\(/,
          `vi heading must not have (: ${heading}`
        );
      }
    }
  }

  // 3. Empty/undefined returns [] (zero smartphone DOM/prop overhead).
  assert.deepEqual(
    buildCustomFieldDisplayRows(undefined, 'smartphones', 'vi'),
    []
  );
  assert.deepEqual(buildCustomFieldDisplayRows(null, 'smartphones', 'en'), []);
  assert.deepEqual(buildCustomFieldDisplayRows({}, 'monitors', 'vi'), []);
  assert.deepEqual(
    buildCustomFieldExportRows(undefined, 'smartphones', 'vi'),
    []
  );
  assert.deepEqual(buildCustomFieldExportRows({}, 'cameras', 'en'), []);

  // 4. Prototype-pollution safety.
  const hostile = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":"bad","prototype":"bad","size_inch":27}'
  ) as Record<string, unknown>;
  const safeRows = buildCustomFieldDisplayRows(hostile, 'monitors', 'en');
  assert.deepEqual(
    safeRows.map((r) => r.key),
    ['size_inch']
  );
  assert.equal(({} as { polluted?: unknown }).polluted, undefined);
  assert.equal(customFieldLabel('__proto__', 'en'), 'Proto');
  assert.equal(customFieldHigherIsBetter('constructor'), undefined);

  // 5. Wave E1 appliances formatting, enums, semantic booleans, and directions.
  const acVi = buildCustomFieldDisplayRows(
    {
      refrigerant_gas: 'R32',
      two_way: true,
      inverter: true,
      hp_rating: 1.5,
      capacity_btu: 12000,
    },
    'air-conditioners',
    'vi'
  );
  assert.deepEqual(
    acVi.map((r) => r.key),
    ['capacity_btu', 'hp_rating', 'inverter', 'two_way', 'refrigerant_gas']
  );
  assert.equal(acVi[0]?.value, '12.000 BTU');
  assert.equal(acVi[0]?.numericValue, 12000);
  assert.equal(acVi[0]?.higherIsBetter, true);
  assert.equal(acVi[1]?.value, '1,5 HP');
  assert.equal(acVi[2]?.value, 'Có');
  assert.equal(acVi[3]?.value, '2 chiều (làm lạnh & sưởi)');
  assert.equal(acVi[4]?.value, 'R32');

  const acEn = buildCustomFieldDisplayRows(
    { capacity_btu: 12000, hp_rating: 1.5, inverter: false, two_way: false },
    'air-conditioners',
    'en'
  );
  assert.equal(acEn[0]?.value, '12,000 BTU');
  assert.equal(acEn[1]?.value, '1.5 HP');
  assert.equal(acEn[2]?.value, 'No');
  assert.equal(acEn[3]?.value, '1-way (cooling only)');

  const acCs = buildCustomFieldDisplayRows(
    { capacity_btu: 12000, two_way: true },
    'air-conditioners',
    'cs'
  );
  assert.equal(acCs[0]?.value, `12${NBSP}000${NBSP}BTU`);
  assert.equal(acCs[1]?.value, 'Dvoucestná');

  // Refrigerators: all 6 door styles + energy rating localization
  for (const [rawDoor, expectedEn] of [
    ['side_by_side', 'Side-by-side'],
    ['french_door', 'French door'],
    ['multidoor', 'Multi-door'],
    ['ngan_da_duoi', 'Bottom freezer'],
    ['ngan_da_tren', 'Top freezer'],
    ['mini', 'Mini fridge'],
  ] as const) {
    const r = buildCustomFieldDisplayRows(
      { door_style: rawDoor },
      'refrigerators',
      'en'
    );
    assert.equal(r[0]?.value, expectedEn, rawDoor);
    assert.equal(r[0]?.lang, undefined);
  }
  const energyVi = buildCustomFieldDisplayRows(
    { energy_rating: '5 sao' },
    'refrigerators',
    'vi'
  );
  const energyEn = buildCustomFieldDisplayRows(
    { energy_rating: '5 sao' },
    'refrigerators',
    'en'
  );
  const energyCs = buildCustomFieldDisplayRows(
    { energy_rating: '5 sao' },
    'refrigerators',
    'cs'
  );
  assert.equal(energyVi[0]?.value, '5 sao');
  assert.equal(energyEn[0]?.value, '5 stars');
  assert.equal(energyCs[0]?.value, `5${NBSP}hvězdiček`);
  assert.equal(energyEn[0]?.numericValue, 5);
  assert.equal(energyEn[0]?.higherIsBetter, true);

  // Washing machines: drum_type, spin_rpm, washer_dryer
  const wmVi = buildCustomFieldDisplayRows(
    {
      capacity_kg: 10.5,
      drum_type: 'front_load',
      spin_rpm: 1400,
      washer_dryer: true,
    },
    'washing-machines',
    'vi'
  );
  assert.equal(wmVi[0]?.value, '10,5 kg');
  assert.equal(wmVi[1]?.value, 'Cửa trước (lồng ngang)');
  assert.equal(wmVi[2]?.value, '1.400 vòng/phút');
  assert.equal(wmVi[3]?.value, 'Có');
  assert.equal(
    buildCustomFieldDisplayRows(
      { drum_type: 'top_load', spin_rpm: 1400 },
      'washing-machines',
      'en'
    )
      .map((r) => r.value)
      .join(' | '),
    'Top-load | 1,400 RPM'
  );

  // TVs & Air purifiers (noise_db lower is better, filter_grades list)
  const tvEn = buildCustomFieldDisplayRows(
    {
      screen_size_inch: 65,
      panel_tech: 'OLED',
      resolution: '4K UHD',
      refresh_rate_hz: 120,
      smart_os: 'webOS',
    },
    'tvs',
    'en'
  );
  assert.equal(tvEn.length, 5);
  assert.equal(tvEn[0]?.value, '65 inch');
  assert.equal(tvEn[3]?.value, '120 Hz');

  const apVi = buildCustomFieldDisplayRows(
    {
      cadr_m3h: 400,
      room_area_m2: 48,
      filter_grades: ['HEPA H13', 'Carbon'],
      noise_db: 32,
      has_pm25_sensor: true,
    },
    'air-purifiers',
    'vi'
  );
  assert.equal(apVi[0]?.value, '400 m³/h');
  assert.equal(apVi[1]?.value, '48 m²');
  assert.equal(apVi[2]?.value, 'HEPA H13, Carbon');
  assert.equal(apVi[3]?.value, '32 dB');
  assert.equal(apVi[3]?.higherIsBetter, false);
  assert.equal(apVi[4]?.value, 'Có');

  // 6. Wave E2/E5/E6 services: bank-savings, internet-telecom, credit-cards, vps-hosting.
  const bankVi = buildCustomFieldDisplayRows(
    {
      tenor_label: '12 tháng',
      tenor_months: 12,
      interest_rate_pct: 5.8,
      account_type: 'online',
      product_line: 'Tiết kiệm trực tuyến',
    },
    'bank-savings',
    'vi'
  );
  assert.equal(bankVi[0]?.value, '12 tháng');
  assert.equal(bankVi[1]?.value, '12 tháng');
  assert.equal(bankVi[1]?.higherIsBetter, undefined);
  assert.equal(bankVi[2]?.value, '5,8%/năm');
  assert.equal(bankVi[2]?.higherIsBetter, true);
  assert.equal(bankVi[3]?.value, 'Gửi trực tuyến');
  assert.equal(bankVi[4]?.lang, undefined);

  const bankEn = buildCustomFieldDisplayRows(
    {
      tenor_months: 12,
      interest_rate_pct: 5.8,
      account_type: 'counter',
      product_line: 'Tiết kiệm Phát Lộc',
    },
    'bank-savings',
    'en'
  );
  assert.equal(bankEn[0]?.value, '12 months');
  assert.equal(bankEn[1]?.value, '5.8%/yr');
  assert.equal(bankEn[2]?.value, 'Over-the-counter');
  assert.equal(bankEn[3]?.lang, 'vi');

  for (const [kind, expVi, expEn] of [
    ['fiber', 'Cáp quang', 'Fiber broadband'],
    ['mobile_data', 'Data di động', 'Mobile data'],
    ['combo', 'Combo Internet & Truyền hình', 'Internet & TV combo'],
  ] as const) {
    assert.equal(
      buildCustomFieldDisplayRows(
        { package_kind: kind },
        'internet-telecom',
        'vi'
      )[0]?.value,
      expVi
    );
    assert.equal(
      buildCustomFieldDisplayRows(
        { package_kind: kind },
        'internet-telecom',
        'en'
      )[0]?.value,
      expEn
    );
  }

  // Credit cards: VND formatting across vi/en/cs, decimal percent, lang tagging, higherIsBetter.
  const ccPayload = {
    card_network: 'Visa',
    card_tier: 'Signature',
    annual_fee_vnd: 1_650_000,
    annual_fee_waiver_rule: 'Miễn phí năm đầu khi chi tiêu 2 triệu',
    cashback_rate_pct: 5,
    cashback_cap_vnd: 600_000,
    min_income_vnd: 15_000_000,
    fx_fee_pct: 1.99,
  };
  const ccVi = buildCustomFieldDisplayRows(ccPayload, 'credit-cards', 'vi');
  const ccEn = buildCustomFieldDisplayRows(ccPayload, 'credit-cards', 'en');
  const ccCs = buildCustomFieldDisplayRows(ccPayload, 'credit-cards', 'cs');
  assert.equal(ccVi[2]?.value, '1.650.000 ₫');
  assert.equal(ccEn[2]?.value, '1,650,000 ₫');
  assert.equal(ccCs[2]?.value, `1${NBSP}650${NBSP}000${NBSP}₫`);
  assert.equal(ccVi[2]?.higherIsBetter, false);
  assert.equal(ccVi[3]?.lang, undefined);
  assert.equal(ccEn[3]?.lang, 'vi');
  assert.equal(ccCs[3]?.lang, 'vi');
  assert.equal(ccVi[4]?.value, '5%');
  assert.equal(ccVi[4]?.higherIsBetter, true);
  assert.equal(ccVi[5]?.value, '600.000 ₫');
  assert.equal(ccVi[5]?.higherIsBetter, true);
  assert.equal(ccVi[6]?.value, '15.000.000 ₫');
  assert.equal(ccVi[6]?.higherIsBetter, false);
  assert.equal(ccVi[7]?.value, '1,99%');
  assert.equal(ccEn[7]?.value, '1.99%');
  assert.equal(ccCs[7]?.value, `1,99${NBSP}%`);
  assert.equal(ccVi[7]?.higherIsBetter, false);

  // VPS hosting
  const vpsVi = buildCustomFieldDisplayRows(
    {
      vcpu: 4,
      ram_gb: 8,
      storage_gb: 160,
      storage_type: 'NVMe SSD',
      bandwidth: 'Unlimited',
      bandwidth_tb: 5,
      datacenter_location: 'Hà Nội',
      virtualization: 'KVM',
      billing_cycle: 'monthly',
    },
    'vps-hosting',
    'vi'
  );
  assert.equal(vpsVi[0]?.value, '4 vCPU');
  assert.equal(vpsVi[1]?.value, '8 GB');
  assert.equal(vpsVi[2]?.value, '160 GB');
  assert.equal(vpsVi[4]?.value, 'Không giới hạn');
  assert.equal(vpsVi[5]?.value, '5 TB');
  assert.equal(vpsVi[8]?.value, 'Hàng tháng');
  assert.equal(
    buildCustomFieldDisplayRows(
      { billing_cycle: 'monthly', datacenter_location: 'Hà Nội' },
      'vps-hosting',
      'cs'
    )[1]?.value,
    'Měsíčně'
  );
  assert.equal(
    buildCustomFieldDisplayRows(
      { datacenter_location: 'Hà Nội' },
      'vps-hosting',
      'en'
    )[0]?.lang,
    'vi'
  );

  // 7. Wave E3 retail: cosmetics, mother-baby, supplements.
  for (const form of [
    'sunscreen',
    'micellar_water',
    'cleanser',
    'serum',
    'mask',
    'toner',
    'lotion',
    'scrub',
    'balm',
    'gel',
    'cream',
    'wash',
  ] as const) {
    for (const locale of ['vi', 'en', 'cs'] as const) {
      const row = buildCustomFieldDisplayRows(
        { product_form: form },
        'cosmetics',
        locale
      )[0];
      assert.ok(
        row && row.value.length > 0 && row.value !== form,
        `${form}/${locale}`
      );
      assert.equal(row.lang, undefined);
    }
  }
  for (const [rawSkin, expectedVi, expectedEn] of [
    ['da dau mun', 'Da dầu mụn', 'Oily & acne-prone skin'],
    ['da nhay cam', 'Da nhạy cảm', 'Sensitive skin'],
    ['da kho', 'Da khô', 'Dry skin'],
    ['da hon hop', 'Da hỗn hợp', 'Combination skin'],
    ['moi loai da', 'Mọi loại da', 'All skin types'],
  ] as const) {
    assert.equal(
      buildCustomFieldDisplayRows({ skin_type: rawSkin }, 'cosmetics', 'vi')[0]
        ?.value,
      expectedVi
    );
    assert.equal(
      buildCustomFieldDisplayRows({ skin_type: rawSkin }, 'cosmetics', 'en')[0]
        ?.value,
      expectedEn
    );
  }
  for (const [country, expVi, expCs] of [
    ['France', 'Pháp', 'Francie'],
    ['Japan', 'Nhật Bản', 'Japonsko'],
    ['South Korea', 'Hàn Quốc', 'Jižní Korea'],
    ['Germany', 'Đức', 'Německo'],
    ['USA', 'Mỹ', 'USA'],
    ['Australia', 'Úc', 'Austrálie'],
    ['Switzerland', 'Thụy Sĩ', 'Švýcarsko'],
    ['UK', 'Anh', 'Spojené království'],
    ['Vietnam', 'Việt Nam', 'Vietnam'],
    ['Canada', 'Canada', 'Kanada'],
    ['New Zealand', 'New Zealand', 'Nový Zéland'],
    ['Thailand', 'Thái Lan', 'Thajsko'],
    ['Netherlands', 'Hà Lan', 'Nizozemsko'],
    ['Italy', 'Ý', 'Itálie'],
  ] as const) {
    assert.equal(
      buildCustomFieldDisplayRows(
        { origin_country: country },
        'cosmetics',
        'vi'
      )[0]?.value,
      expVi
    );
    assert.equal(
      buildCustomFieldDisplayRows(
        { origin_country: country },
        'cosmetics',
        'cs'
      )[0]?.value,
      expCs
    );
  }

  for (const ptype of [
    'formula_milk',
    'liquid_milk',
    'diaper',
    'feeding_bottle',
    'pacifier_teat',
    'baby_food',
  ] as const) {
    assert.notEqual(
      buildCustomFieldDisplayRows(
        { product_type: ptype },
        'mother-baby',
        'vi'
      )[0]?.value,
      ptype
    );
  }
  const mbRows = buildCustomFieldDisplayRows(
    { age_range_months: '0-6', diaper_count: 60 },
    'mother-baby',
    'vi'
  );
  assert.equal(mbRows[0]?.value, '0-6 tháng');
  assert.equal(mbRows[1]?.value, '60 miếng');
  assert.equal(mbRows[1]?.higherIsBetter, true);
  assert.equal(
    buildCustomFieldDisplayRows(
      { age_range_months: '6+' },
      'mother-baby',
      'en'
    )[0]?.value,
    '6+ months'
  );

  for (const form of [
    'effervescent',
    'softgel',
    'capsule',
    'tablet',
    'liquid',
    'gummy',
    'powder',
    'drops',
    'spray',
  ] as const) {
    assert.notEqual(
      buildCustomFieldDisplayRows({ dosage_form: form }, 'supplements', 'vi')[0]
        ?.value,
      form
    );
  }
  for (const benefit of [
    'bone_joint',
    'energy_vitality',
    'immunity',
    'digestive_gut',
    'brain_sleep',
    'heart_eye',
    'women_hormone',
    'liver',
    'skin_beauty',
  ] as const) {
    assert.notEqual(
      buildCustomFieldDisplayRows(
        { target_benefit: benefit },
        'supplements',
        'vi'
      )[0]?.value,
      benefit
    );
  }
  const suppEn = buildCustomFieldDisplayRows(
    {
      serving_size: '2 capsules daily',
      key_actives: ['Vitamin D3', 'K2'],
      is_otc_safe: true,
    },
    'supplements',
    'vi'
  );
  assert.equal(suppEn[0]?.lang, 'en');
  assert.equal(suppEn[1]?.value, 'Vitamin D3, K2');
  assert.equal(suppEn[2]?.value, 'Có');

  // 8. Wave E6 monitors & cameras.
  const monVi = buildCustomFieldDisplayRows(
    {
      size_inch: 27,
      panel_type: 'QD-OLED',
      resolution: '2560 x 1440',
      refresh_rate_hz: 360,
      response_time_ms: 0.03,
      curved: false,
      usb_c_pd_w: 90,
    },
    'monitors',
    'vi'
  );
  assert.equal(monVi[0]?.value, '27 inch');
  assert.equal(monVi[3]?.value, '360 Hz');
  assert.equal(monVi[4]?.value, '0,03 ms');
  assert.equal(monVi[4]?.higherIsBetter, false);
  assert.equal(monVi[5]?.value, 'Màn hình phẳng');
  assert.equal(monVi[6]?.value, '90 W');
  assert.equal(
    buildCustomFieldDisplayRows({ curved: true }, 'monitors', 'en')[0]?.value,
    'Curved'
  );
  assert.equal(
    buildCustomFieldDisplayRows({ curved: true }, 'monitors', 'cs')[0]?.value,
    'Zakřivený'
  );

  const camEn = buildCustomFieldDisplayRows(
    {
      camera_type: 'mirrorless',
      sensor_format: 'full_frame',
      megapixels: 33,
      video_resolution: '4K 60fps',
      lens_mount: 'Sony E',
      ibis: true,
    },
    'cameras',
    'en'
  );
  assert.equal(camEn[0]?.value, 'Mirrorless');
  assert.equal(camEn[1]?.value, 'Full-Frame');
  assert.equal(camEn[2]?.value, '33 MP');
  assert.equal(camEn[2]?.higherIsBetter, true);
  assert.equal(camEn[5]?.value, 'Yes');

  // 9. Unknown future key fallback & canonical ordering.
  assert.equal(humanizeCustomFieldKey('warranty_months'), 'Warranty months');
  assert.equal(humanizeCustomFieldKey('usb_c_ports'), 'USB c ports');
  assert.deepEqual(
    orderCustomFieldKeys(
      ['z_extra', 'curved', 'a_extra', 'size_inch'],
      'monitors'
    ),
    ['size_inch', 'curved', 'a_extra', 'z_extra']
  );

  // 10. ProductSpecsExportToolbar custom export rows + smartphone 13-row invariant.
  const phoneRows = buildProductSpecExportRows({}, {}, 'smartphones');
  assert.equal(phoneRows.length, 13);
  const monCustomExport = buildCustomFieldExportRows(
    { size_inch: 27, refresh_rate_hz: 165, curved: false },
    'monitors',
    'vi'
  );
  assert.equal(monCustomExport.length, 3);
  const monExport = buildProductSpecExportRows(
    { custom_fields: { size_inch: 27, refresh_rate_hz: 165, curved: false } },
    {},
    'monitors',
    monCustomExport
  );
  assert.ok(
    monExport.some(
      ([, attr, val]) => attr === 'Tần số quét' && val === '165 Hz'
    )
  );
  assert.ok(
    monExport.some(
      ([, attr, val]) =>
        attr === 'Thiết kế màn hình' && val === 'Màn hình phẳng'
    )
  );
  // Fallback export path when customExportRows is omitted still emits sanitized custom_fields.
  const monFallbackExport = buildProductSpecExportRows(
    { custom_fields: { size_inch: 27, curved: true } },
    {},
    'monitors'
  );
  assert.ok(
    monFallbackExport.some(
      ([grp, attr, val]) =>
        grp === 'Category specifications' &&
        attr === 'Size inch' &&
        val === '27'
    )
  );

  // 11. Perf-budget architectural guard: ProductSpecsExportToolbar stays free of custom-fields-display.
  const toolbarSrc = readFileSync(
    new URL(
      '../../components/leaderboard/ProductSpecsExportToolbar.tsx',
      import.meta.url
    ),
    'utf8'
  );
  assert.equal(
    toolbarSrc.includes('custom-fields-display'),
    false,
    'ProductSpecsExportToolbar must not bundle custom-fields-display into /smartphones/[slug] client JS'
  );
  const detailSrc = readFileSync(
    new URL('../../app/[locale]/smartphones/[slug]/page.tsx', import.meta.url),
    'utf8'
  );
  assert.ok(detailSrc.includes('data-testid="custom-fields-spec-card"'));
  assert.ok(
    detailSrc.includes('...(customExportRows ? { customExportRows } : {})')
  );

  // 12. CompareWorkspace custom_fields synthesis, ordering, winner direction, diff-only & specPart.
  const nodeModule = await import('node:module');
  const extMap = (
    nodeModule.default as unknown as {
      _extensions?: Record<string, (mod: { exports: unknown }) => void>;
    }
  )._extensions;
  if (extMap && !extMap['.css']) {
    extMap['.css'] = (mod) => {
      mod.exports = {};
    };
  }
  const {
    buildSpecGroups,
    filterSpecGroupsForCategory,
    buildCustomFieldsCompareGroup,
    mergeCustomFieldsCompareGroup,
  } = await import('../../components/compare/CompareWorkspace');
  const t = ((k: string) => k) as unknown as Parameters<
    typeof buildSpecGroups
  >[0];

  const phoneNoCustom = {
    id: 'p1',
    slug: 'iphone-16',
    specifications: {},
  } as unknown as MasterProduct;
  assert.equal(
    buildCustomFieldsCompareGroup([phoneNoCustom], 'smartphones', 'vi'),
    null
  );

  const cardA = {
    id: 'cc1',
    slug: 'vib-cashback',
    specifications: {
      category_slug: 'credit-cards',
      custom_fields: {
        card_network: 'Mastercard',
        annual_fee_vnd: 0,
        cashback_rate_pct: 6,
        fx_fee_pct: 1.99,
        annual_fee_waiver_rule: 'Miễn phí trọn đời',
      },
    },
  } as unknown as MasterProduct;
  const cardB = {
    id: 'cc2',
    slug: 'vpbank-stepup',
    specifications: {
      category_slug: 'credit-cards',
      custom_fields: {
        card_network: 'Mastercard',
        annual_fee_vnd: 1_650_000,
        cashback_rate_pct: 15,
        fx_fee_pct: 3.5,
      },
    },
  } as unknown as MasterProduct;

  const customGroup = buildCustomFieldsCompareGroup(
    [cardA, cardB],
    'credit-cards',
    'en'
  );
  assert.ok(customGroup, 'expected synthesized custom_fields compare group');
  assert.equal(customGroup.id, 'custom_fields');
  assert.equal(customGroup.title, 'Card fees & rewards');
  assert.deepEqual(
    customGroup.rows.map((r) => r.id),
    [
      'custom_card_network',
      'custom_annual_fee_vnd',
      'custom_annual_fee_waiver_rule',
      'custom_cashback_rate_pct',
      'custom_fx_fee_pct',
    ]
  );

  const merged = mergeCustomFieldsCompareGroup(
    filterSpecGroupsForCategory(buildSpecGroups(t, 'en'), 'credit-cards'),
    customGroup
  );
  assert.equal(merged[0]?.id, 'market_trust');
  assert.equal(merged[1]?.id, 'custom_fields');
  assert.equal(merged[2]?.id, 'availability');

  const feeRow = customGroup.rows.find(
    (r) => r.id === 'custom_annual_fee_vnd'
  )!;
  assert.equal(feeRow.higherIsBetter, false);
  assert.equal(feeRow.numericValue?.(cardA), 0);
  assert.equal(feeRow.numericValue?.(cardB), 1_650_000);
  assert.equal(feeRow.renderValue(cardA), '0 ₫');
  assert.equal(feeRow.renderValue(cardB), '1,650,000 ₫');

  const cashbackRow = customGroup.rows.find(
    (r) => r.id === 'custom_cashback_rate_pct'
  )!;
  assert.equal(cashbackRow.higherIsBetter, true);
  assert.equal(cashbackRow.numericValue?.(cardA), 6);
  assert.equal(cashbackRow.numericValue?.(cardB), 15);

  const networkRow = customGroup.rows.find(
    (r) => r.id === 'custom_card_network'
  )!;
  assert.equal(
    compareRowIsShown(
      [networkRow.renderValue(cardA), networkRow.renderValue(cardB)],
      true
    ),
    false,
    'identical custom_fields row hides under showDiffOnly'
  );
  assert.equal(
    compareRowIsShown(
      [feeRow.renderValue(cardA), feeRow.renderValue(cardB)],
      true
    ),
    true,
    'differing custom_fields row stays visible under showDiffOnly'
  );

  const waiverRow = customGroup.rows.find(
    (r) => r.id === 'custom_annual_fee_waiver_rule'
  )!;
  assert.doesNotMatch(waiverRow.renderValue(cardA), /[\uE000\uE001]/);
  const waiverSegments = compareCellSegments(waiverRow.renderCell!(cardA));
  assert.equal(waiverSegments.length, 1);
  assert.equal(
    waiverSegments[0]?.spec,
    true,
    'raw Vietnamese string wrapped with specPart on en'
  );
  assert.equal(
    plainCompareCell(waiverRow.renderCell!(cardA)),
    'Miễn phí trọn đời'
  );
  assert.equal(waiverRow.renderCell!(cardB), '-');

  console.warn('✅ Category custom_fields display & compare suite passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
