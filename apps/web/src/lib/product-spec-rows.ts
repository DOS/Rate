import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  specFieldApplies,
  type CategorySpecTemplate,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  localizedSpecValue,
  normalizeStorageExpansion,
  type SpecUiDictionary,
} from './spec-localizer';
import { localizeDecimalPoints } from './locale-format';

export interface ProductSpecRow {
  label: string;
  value: string;
  /** The value's language when it is not the page's (DOS/Rate#1371). */
  lang?: 'en' | 'vi';
}

export interface ProductSpecGroup {
  group: SpecGroupKey;
  rows: ProductSpecRow[];
}

/** The flat columns the spec section falls back to. */
export interface ProductSpecFallbacks {
  screen_size_inch?: number | null;
  ram_gb?: number | null;
  storage_gb?: number | null;
  battery_mah?: number | null;
  has_5g?: boolean | null;
}

/** A value the page has nothing to show for: empty or a lone dash. */
export function isEmptySpecValue(value: string | null | undefined): boolean {
  const text = (value ?? '').trim();
  return text === '' || text === '-';
}

/**
 * Whether compare shows a row (DOS/Rate#1186): not when no compared product
 * has a value, so "-" stays only where another column has one. With
 * `diffOnly`, rows where every column agrees are left out too.
 */
export function compareRowIsShown(
  values: readonly string[],
  diffOnly: boolean
): boolean {
  if (values.length === 0) return true;
  if (values.every(isEmptySpecValue)) return false;
  if (!diffOnly || values.length < 2) return true;
  return new Set(values.map((v) => v.trim())).size > 1;
}

/**
 * A stored 5G flag as known true, known false or unknown (null). Older
 * enricher rows may hold "true" / "yes" as text; anything else is unknown
 * (DOS/Rate#1193). The nested spec wins over the flat column.
 */
export function known5g(nested: unknown, flat: unknown): boolean | null {
  const read = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (typeof v !== 'string') return null;
    const text = v.trim().toLowerCase();
    if (['true', 'yes', 'có'].includes(text)) return true;
    if (['false', 'no', 'không'].includes(text)) return false;
    return null;
  };
  return read(nested) ?? read(flat);
}

const joined = (parts: unknown[], separator: string): string =>
  parts.filter(Boolean).join(separator);

/**
 * The product page's spec groups in the category's template order, with the
 * rows that have no value left out and a group with no row left out
 * (DOS/Rate#1186). The page used to print those rows as "-".
 */
export function buildProductSpecGroups({
  specs,
  keySpecs,
  product,
  template,
  ui,
  locale,
}: {
  specs: ProductSpecifications | null | undefined;
  keySpecs: KeySpecs | null | undefined;
  product: ProductSpecFallbacks;
  template: CategorySpecTemplate;
  ui: SpecUiDictionary;
  locale: string;
}): ProductSpecGroup[] {
  const s = specs ?? ({} as ProductSpecifications);
  const k = keySpecs ?? ({} as KeySpecs);
  const f = ui.fields;
  // A row's value with its language when that is not the page's, kept with
  // the row it belongs to (DOS/Rate#1371).
  const locRow = (
    v: string | number | boolean | null | undefined
  ): Pick<ProductSpecRow, 'value' | 'lang'> => {
    const { text, lang } = localizedSpecValue(v, locale);
    return lang ? { value: text, lang } : { value: text };
  };
  const shows = (group: SpecGroupKey, field: string) =>
    specFieldApplies(template, group, field);
  const withUnit = (value: unknown, unit: string) =>
    value ? `${value} ${unit}` : '';
  const yesNo = (value: unknown, yes = ui.yes) =>
    value === true ? yes : value === false ? ui.no : '';
  const showBands5g = shows('cellular', 'bands_5g');
  const batteryCapacity =
    withUnit(s.battery?.capacity_mah, 'mAh') ||
    withUnit(product.battery_mah, 'mAh');

  const groups: Record<SpecGroupKey, (ProductSpecRow | false)[]> = {
    display: [
      {
        label: f.screenSize,
        value: localizeDecimalPoints(
          withUnit(s.display?.size_inch, 'inch') ||
            withUnit(product.screen_size_inch, 'inch'),
          locale
        ),
      },
      { label: f.panelType, ...locRow(s.display?.type || k.screen) },
      { label: f.resolution, ...locRow(s.display?.resolution) },
      {
        label: f.refreshRate,
        value: withUnit(s.display?.refresh_rate_hz, 'Hz'),
      },
      { label: f.ppi, value: withUnit(s.display?.ppi, 'ppi') },
      { label: f.protection, ...locRow(s.display?.protection) },
      { label: f.displayFeatures, ...locRow(s.display?.features) },
    ],
    hardware: [
      { label: f.chipset, ...locRow(s.hardware?.chipset || k.chip) },
      shows('hardware', 'cpu') && { label: f.cpu, ...locRow(s.hardware?.cpu) },
      shows('hardware', 'gpu') && { label: f.gpu, ...locRow(s.hardware?.gpu) },
      shows('hardware', 'ram_gb') && {
        label: f.ram,
        value:
          withUnit(s.hardware?.ram_gb, 'GB') || withUnit(product.ram_gb, 'GB'),
      },
      shows('hardware', 'storage_gb') && {
        label: f.storage,
        value:
          withUnit(s.hardware?.storage_gb, 'GB') ||
          withUnit(product.storage_gb, 'GB'),
      },
      shows('hardware', 'storage_expansion') && {
        label: f.storageExpansion,
        ...locRow(
          s.hardware?.storage_expansion &&
            normalizeStorageExpansion(s.hardware.storage_expansion)
        ),
      },
      shows('hardware', 'os') && { label: f.os, ...locRow(s.hardware?.os) },
    ],
    camera: [
      { label: f.rearSetup, ...locRow(s.camera?.rear_setup) },
      {
        label: f.mainCamera,
        ...locRow(s.camera?.main_camera || k.camera),
      },
      { label: f.secondCamera, ...locRow(s.camera?.second_camera) },
      { label: f.thirdCamera, ...locRow(s.camera?.third_camera) },
      { label: f.fourthCamera, ...locRow(s.camera?.fourth_camera) },
      { label: f.frontCamera, ...locRow(s.camera?.front_camera) },
      {
        label: f.videoAndFlash,
        ...locRow(joined([s.camera?.video_recording, s.camera?.flash], ' | ')),
      },
    ],
    battery: [
      {
        label: f.batteryCapacity,
        ...(batteryCapacity ? { value: batteryCapacity } : locRow(k.battery)),
      },
      { label: f.batteryType, ...locRow(s.battery?.type) },
      { label: f.chargingTech, ...locRow(s.battery?.charging) },
      {
        label: f.fastCharging,
        value: withUnit(s.battery?.fast_charging_w, 'W'),
      },
      {
        label: f.reverseCharging,
        ...(typeof s.battery?.reverse_charging === 'string'
          ? locRow(s.battery.reverse_charging)
          : { value: yesNo(s.battery?.reverse_charging, ui.supported) }),
      },
    ],
    design: [
      { label: f.dimensions, ...locRow(s.design?.dimensions) },
      { label: f.weight, value: withUnit(s.design?.weight_g, 'g') },
      {
        label: f.materialsAndBuild,
        ...locRow(joined([s.design?.materials, s.design?.build], ' | ')),
      },
      { label: f.resistance, ...locRow(s.design?.resistance) },
      shows('design', 'biometrics') && {
        label: f.biometrics,
        ...locRow(s.design?.biometrics),
      },
      { label: f.physicalKeys, ...locRow(s.design?.keys) },
    ],
    cellular: [
      // Unknown is empty, not "No" (DOS/Rate#1193).
      shows('cellular', 'has_5g') && {
        label: f.support5g,
        value: yesNo(known5g(s.cellular?.has_5g, product.has_5g), ui.has5gYes),
      },
      { label: f.networkTech, ...locRow(s.cellular?.technology) },
      { label: f.simType, ...locRow(s.cellular?.sim_type) },
      { label: f.dataSpeed, ...locRow(s.cellular?.data_speed) },
      {
        label: showBands5g ? f.bands5g4g : f.bands4g,
        ...locRow(
          joined(
            [showBands5g ? s.cellular?.bands_5g : null, s.cellular?.bands_4g],
            ' | '
          )
        ),
      },
      {
        label: f.volteVowifi,
        value: joined(
          [
            s.cellular?.volte ? 'VoLTE' : null,
            s.cellular?.vowifi ? 'VoWiFi' : null,
          ],
          ' + '
        ),
      },
    ],
    connectivity: [
      shows('connectivity', 'wlan') && {
        label: f.wlan,
        ...locRow(s.connectivity?.wlan),
      },
      { label: f.bluetooth, ...locRow(s.connectivity?.bluetooth) },
      { label: f.usbPort, ...locRow(s.connectivity?.usb) },
      shows('connectivity', 'nfc') && {
        label: f.nfc,
        value: yesNo(s.connectivity?.nfc),
      },
      shows('connectivity', 'location') && {
        label: f.locationGps,
        ...locRow(s.connectivity?.location),
      },
      {
        label: f.sensorsAndOther,
        ...locRow(
          joined([s.connectivity?.sensors, s.connectivity?.other], ' | ')
        ),
      },
    ],
    multimedia: [
      { label: f.loudspeaker, ...locRow(s.multimedia?.loudspeaker) },
      shows('multimedia', 'headphone_jack_35mm') && {
        label: f.jack35mm,
        value: yesNo(s.multimedia?.headphone_jack_35mm),
      },
      { label: f.audioFeatures, ...locRow(s.multimedia?.audio_features) },
    ],
    availability: [
      { label: f.announcedDate, ...locRow(s.availability?.announced) },
      {
        label: f.commercialStatus,
        ...locRow(s.availability?.status),
      },
      { label: f.msrpPrice, ...locRow(s.availability?.prices_msrp) },
    ],
    regulatory: [
      {
        label: f.certifications,
        ...locRow(s.regulatory?.certifications),
      },
      { label: f.fccApproval, ...locRow(s.regulatory?.fcc_approval) },
      {
        label: f.sarLevel,
        value: joined(
          [
            s.regulatory?.sar_head
              ? `${f.sarHeadPrefix}: ${s.regulatory.sar_head}`
              : null,
            s.regulatory?.sar_body
              ? `${f.sarBodyPrefix}: ${s.regulatory.sar_body}`
              : null,
          ],
          ' | '
        ),
      },
    ],
  };

  return template.groups
    .map((group) => ({
      group,
      rows: groups[group].filter(
        (row): row is ProductSpecRow =>
          row !== false && !isEmptySpecValue(row.value)
      ),
    }))
    .filter(({ rows }) => rows.length > 0);
}
