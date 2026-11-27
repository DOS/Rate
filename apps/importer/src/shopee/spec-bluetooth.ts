/**
 * Bluetooth values stored as the version only ("6.0", "5.3"), the form DOS/Rate#1910 gave the
 * canonical iPhones. Spec pages and the AI enricher state "6.0, A2DP, LE": profile names
 * are not a version, and a re-run of any writer (seed backfill, AI enrich, Arena sync) would
 * write them back over a clean value (DOS/Rate#1955). Pure: no input is changed.
 */

const PROFILE_TOKEN = '(?:A2DP|AVRCP|HFP|HSP|LE|LDAC|aptX|AAC|SBC|LC3|LHDC)\\b';
// A version (optionally "Bluetooth 5.3"), then a list: "6.0, A2DP, LE", "5.4; LDAC", "5.3 (SBC)",
// "5.3/LE Audio", "5.3 LE". A comma directly before a digit is a decimal comma ("5,3"), and
// "5.4 Wireless Card" is not a list.
const BLUETOOTH_VERSION_WITH_LIST_RE = new RegExp(
  `^\\s*(?:Bluetooth\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:(?:,(?!\\d)|[;(/])\\s*\\S|\\s+${PROFILE_TOKEN})`,
  'i'
);

/** The version of "6.0, A2DP, LE"; a value that does not start with a version is returned as is. */
export function bluetoothVersionOnly(value: string): string {
  const match = BLUETOOTH_VERSION_WITH_LIST_RE.exec(value);
  return match ? match[1]! : value;
}

const hasNoValue = (group: Record<string, unknown>): boolean =>
  Object.values(group).every(v => v === undefined || v === null);

/**
 * Earbuds keep their codecs in `connectivity.bluetooth` (the enricher prompt asks for them
 * there: "put their codecs in connectivity.bluetooth"), so only they are left alone.
 * `category_slug` is trusted first. A master with no slug is an earbud only in the seeds'
 * earbud shape (DOS/Rate#1793): a `display` group with no value and a `cellular` group that
 * states no network (nothing but `has_5g: false` or empty). A phone or tablet missing its
 * display values but with a network field (`has_5g: true`, bands) is cut.
 */
export function keepsBluetoothCodecs(specs: Record<string, unknown>): boolean {
  const slug = typeof specs.category_slug === 'string' ? specs.category_slug : '';
  if (slug) return slug === 'earbuds';
  const display = specs.display;
  if (!display || typeof display !== 'object' || Array.isArray(display)) return false;
  if (!hasNoValue(display as Record<string, unknown>)) return false;
  const cellular = specs.cellular;
  if (cellular === undefined || cellular === null) return true;
  if (typeof cellular !== 'object' || Array.isArray(cellular)) return false;
  return Object.values(cellular as Record<string, unknown>).every(
    v => v === undefined || v === null || v === false
  );
}

/** `specs` with `connectivity.bluetooth` cut to its version, except for earbuds. */
export function withBluetoothVersionOnly<T extends Record<string, unknown>>(specs: T): T {
  const connectivity = specs.connectivity;
  if (!connectivity || typeof connectivity !== 'object' || Array.isArray(connectivity)) {
    return specs;
  }
  const bluetooth = (connectivity as Record<string, unknown>).bluetooth;
  if (typeof bluetooth !== 'string' || keepsBluetoothCodecs(specs)) return specs;
  const version = bluetoothVersionOnly(bluetooth);
  if (version === bluetooth) return specs;
  return { ...specs, connectivity: { ...connectivity, bluetooth: version } };
}
