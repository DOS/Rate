/**
 * Removes retracted spec paths ("battery.fast_charging_w", "key_specs.ram"): values an
 * earlier, unsourced seed wrote that the sources do not support. Both the backfill and the
 * Arena sync merge field by field, so without this a retracted value would survive, or be
 * written back (DOS/Rate#1459). Pure: the input is cloned, never changed.
 */
export function withoutRetractedSpecs<T>(
  value: T,
  paths: readonly string[] | undefined,
  scope: 'specifications' | 'key_specs'
): T {
  if (!paths || paths.length === 0 || !value || typeof value !== 'object') return value;
  const copy = structuredClone(value) as Record<string, unknown>;
  for (const path of paths) {
    const parts = path.split('.');
    const own = scope === 'key_specs' ? parts[0] === 'key_specs' : parts[0] !== 'key_specs';
    if (!own) continue;
    const [group, field] = scope === 'key_specs' ? [parts[1], undefined] : [parts[0], parts[1]];
    if (!group) continue;
    if (field === undefined) {
      delete copy[group];
      continue;
    }
    const record = copy[group];
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      delete (record as Record<string, unknown>)[field];
      if (Object.keys(record).length === 0) delete copy[group];
    }
  }
  return copy as T;
}

/**
 * Whether a spec page's model name can be the Item's model: it names the first word of the
 * Item key's model part ("iphone" of "iphone-18-pro-max", "galaxy", "watch", "17" of Xiaomi
 * "17-pro-max"). Loose on purpose (a page name need not carry a key's size or chip, "Apple
 * Watch Series 11" for "watch-series-11-46mm"), it still keeps a page for another device
 * ("itel A95" under an iPhone 18 Pro Max URL) off the Item (DOS/Rate#1459).
 */
export function specPageMatchesItem(modelName: unknown, itemKey: string): boolean {
  if (typeof modelName !== 'string') return false;
  const first = (itemKey.split(':')[1] ?? '').split('-').find(Boolean);
  if (!first) return false;
  return modelName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes(first);
}
