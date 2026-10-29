import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  specFieldApplies,
  type CategorySpecTemplate,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  localizeSpecValue,
  normalizeStorageExpansion,
  type SpecUiDictionary,
} from './spec-localizer';

export interface ProductSpecRow {
  label: string;
  value: string;
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
  const loc = (v: string | number | boolean | null | undefined) =>
    localizeSpecValue(v, locale);
  const shows = (group: SpecGroupKey, field: string) =>
    specFieldApplies(template, group, field);
  const withUnit = (value: unknown, unit: string) =>
    value ? `${value} ${unit}` : '';
  const yesNo = (value: unknown, yes = ui.yes) =>
    value === true ? yes : value === false ? ui.no : '';
  const showBands5g = shows('cellular', 'bands_5g');

  const groups: Record<SpecGroupKey, (ProductSpecRow | false)[]> = {
    display: [
      {
        label: f.screenSize,
        value:
          withUnit(s.display?.size_inch, 'inch') ||
          withUnit(product.screen_size_inch, 'inch'),
      },
      { label: f.panelType, value: loc(s.display?.type || k.screen) },
      { label: f.resolution, value: loc(s.display?.resolution) },
      {
        label: f.refreshRate,
        value: withUnit(s.display?.refresh_rate_hz, 'Hz'),
      },
      { label: f.ppi, value: withUnit(s.display?.ppi, 'ppi') },
      { label: f.protection, value: loc(s.display?.protection) },
      { label: f.displayFeatures, value: loc(s.display?.features) },
    ],
    hardware: [
      { label: f.chipset, value: loc(s.hardware?.chipset || k.chip) },
      shows('hardware', 'cpu') && { label: f.cpu, value: loc(s.hardware?.cpu) },
      shows('hardware', 'gpu') && { label: f.gpu, value: loc(s.hardware?.gpu) },
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
        value: loc(
          s.hardware?.storage_expansion &&
            normalizeStorageExpansion(s.hardware.storage_expansion)
        ),
      },
      shows('hardware', 'os') && { label: f.os, value: loc(s.hardware?.os) },
    ],
    camera: [
      { label: f.rearSetup, value: loc(s.camera?.rear_setup) },
      {
        label: f.mainCamera,
        value: loc(s.camera?.main_camera || k.camera),
      },
      { label: f.secondCamera, value: loc(s.camera?.second_camera) },
      { label: f.thirdCamera, value: loc(s.camera?.third_camera) },
      { label: f.fourthCamera, value: loc(s.camera?.fourth_camera) },
      { label: f.frontCamera, value: loc(s.camera?.front_camera) },
      {
        label: f.videoAndFlash,
        value: loc(joined([s.camera?.video_recording, s.camera?.flash], ' | ')),
      },
    ],
    battery: [
      {
        label: f.batteryCapacity,
        value:
          withUnit(s.battery?.capacity_mah, 'mAh') ||
          withUnit(product.battery_mah, 'mAh') ||
          loc(k.battery),
      },
      { label: f.batteryType, value: loc(s.battery?.type) },
      { label: f.chargingTech, value: loc(s.battery?.charging) },
      {
        label: f.fastCharging,
        value: withUnit(s.battery?.fast_charging_w, 'W'),
      },
      {
        label: f.reverseCharging,
        value:
          typeof s.battery?.reverse_charging === 'string'
            ? loc(s.battery.reverse_charging)
            : yesNo(s.battery?.reverse_charging, ui.supported),
      },
    ],
    design: [
      { label: f.dimensions, value: loc(s.design?.dimensions) },
      { label: f.weight, value: withUnit(s.design?.weight_g, 'g') },
      {
        label: f.materialsAndBuild,
        value: loc(joined([s.design?.materials, s.design?.build], ' | ')),
      },
      { label: f.resistance, value: loc(s.design?.resistance) },
      shows('design', 'biometrics') && {
        label: f.biometrics,
        value: loc(s.design?.biometrics),
      },
      { label: f.physicalKeys, value: loc(s.design?.keys) },
    ],
    cellular: [
      // Unknown is empty, not "No" (DOS/Rate#1193).
      shows('cellular', 'has_5g') && {
        label: f.support5g,
        value: yesNo(known5g(s.cellular?.has_5g, product.has_5g), ui.has5gYes),
      },
      { label: f.networkTech, value: loc(s.cellular?.technology) },
      { label: f.simType, value: loc(s.cellular?.sim_type) },
      { label: f.dataSpeed, value: loc(s.cellular?.data_speed) },
      {
        label: showBands5g ? f.bands5g4g : f.bands4g,
        value: loc(
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
        value: loc(s.connectivity?.wlan),
      },
      { label: f.bluetooth, value: loc(s.connectivity?.bluetooth) },
      { label: f.usbPort, value: loc(s.connectivity?.usb) },
      shows('connectivity', 'nfc') && {
        label: f.nfc,
        value: yesNo(s.connectivity?.nfc),
      },
      shows('connectivity', 'location') && {
        label: f.locationGps,
        value: loc(s.connectivity?.location),
      },
      {
        label: f.sensorsAndOther,
        value: loc(
          joined([s.connectivity?.sensors, s.connectivity?.other], ' | ')
        ),
      },
    ],
    multimedia: [
      { label: f.loudspeaker, value: loc(s.multimedia?.loudspeaker) },
      shows('multimedia', 'headphone_jack_35mm') && {
        label: f.jack35mm,
        value: yesNo(s.multimedia?.headphone_jack_35mm),
      },
      { label: f.audioFeatures, value: loc(s.multimedia?.audio_features) },
    ],
    availability: [
      { label: f.announcedDate, value: loc(s.availability?.announced) },
      {
        label: f.commercialStatus,
        value: loc(s.availability?.status),
      },
      { label: f.msrpPrice, value: loc(s.availability?.prices_msrp) },
    ],
    regulatory: [
      {
        label: f.certifications,
        value: loc(s.regulatory?.certifications),
      },
      { label: f.fccApproval, value: loc(s.regulatory?.fcc_approval) },
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
