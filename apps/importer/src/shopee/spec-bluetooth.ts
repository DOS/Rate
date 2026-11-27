/**
 * Bluetooth values stored as the version only ("6.0", "5.3"), the form DOS/Rate#1910 gave the
 * canonical iPhones. Spec pages and the AI enricher state "6.0, A2DP, LE": profile names
 * are not a version, and a re-run of any writer (seed backfill, AI enrich, Arena sync) would
 * write them back over a clean value (DOS/Rate#1955). Pure: no input is changed.
 */

// A version, then a list: "6.0, A2DP, LE", "5.4; LDAC", "5.3 (SBC, AAC)".
const BLUETOOTH_VERSION_WITH_LIST_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:[,;(]|\s-\s)\s*\S/;

/** The version of "6.0, A2DP, LE"; a value that does not start with a version is returned as is. */
export function bluetoothVersionOnly(value: string): string {
  const match = BLUETOOTH_VERSION_WITH_LIST_RE.exec(value);
  return match ? match[1]! : value;
}

function isEmptyGroup(group: unknown): boolean {
  return (
    !group ||
    typeof group !== 'object' ||
    Array.isArray(group) ||
    Object.values(group as Record<string, unknown>).every(v => v === undefined || v === null)
  );
}

/**
 * Earbuds keep their codecs in `connectivity.bluetooth` (the enricher prompt asks for them
 * there, the sourced earbud seeds state them), so only they are left alone. A master with no
 * `category_slug` in its specs is an earbud when it has no display and no cellular group
 * (the seeds' empty-group shape, DOS/Rate#1793).
 */
export function keepsBluetoothCodecs(specs: Record<string, unknown>): boolean {
  const slug = typeof specs.category_slug === 'string' ? specs.category_slug : '';
  if (slug) return slug === 'earbuds';
  return isEmptyGroup(specs.display) && isEmptyGroup(specs.cellular);
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
