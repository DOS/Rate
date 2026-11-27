import { getCategorySpecTemplate, type SpecGroupKey } from '@repo/shared-data/rules';
import { hasSingleRearCamera, statesRearCamera } from './jobs/backfill-specs.js';

/**
 * Guards that keep the AI spec enricher from paying for calls that cannot add a value
 * (DOS/Rate#1956). Plain functions, so the matcher, the enricher and the tests share them.
 */

/** Groups a source rarely states for a listing; an empty one never makes a master "incomplete". */
const OPTIONAL_GROUPS: ReadonlySet<SpecGroupKey> = new Set(['availability', 'regulatory']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (typeof v === 'string') return v.replace(/\p{Cc}+/gu, '').trim() !== '';
  if (Array.isArray(v)) return v.some(hasValue);
  return false;
}

/** Whether a stored spec group holds at least one value. */
function groupHasValue(group: unknown): boolean {
  return isRecord(group) && Object.values(group).some(hasValue);
}

/**
 * Whether an AI call can add anything for the category. The model answers a device
 * schema, and the importer then drops every group the category lacks, so a category whose
 * template keeps only `availability` and `regulatory` (bank products, cosmetics,
 * restaurants, ...) paid for an answer that was thrown away.
 */
export function categoryNeedsAiSpecs(categorySlug: string | null | undefined): boolean {
  return getCategorySpecTemplate(categorySlug).groups.some(group => !OPTIONAL_GROUPS.has(group));
}

/**
 * The field the spec audit and the page need most in a group: a group with only a label
 * or the colours `mergeProductSpecifications` injects is not complete.
 */
const KEY_FIELD: Partial<Record<SpecGroupKey, string>> = {
  hardware: 'chipset',
  display: 'size_inch',
  battery: 'capacity_mah',
};

function keyFieldPresent(group: SpecGroupKey, value: unknown): boolean {
  const record = isRecord(value) ? value : {};
  if (group === 'camera') {
    // The audit's rule: a stated rear camera needs main_camera, and second_camera unless
    // it is a single-camera device.
    if (!statesRearCamera(record)) return groupHasValue(record);
    if (!hasValue(record.main_camera)) return false;
    return hasSingleRearCamera(record) || hasValue(record.second_camera);
  }
  const key = KEY_FIELD[group];
  return key === undefined ? groupHasValue(record) : hasValue(record[key]);
}

/**
 * Whether the stored specifications already hold the key value of every group the category
 * has, except the optional ones. Asking the model again then costs a call and can only
 * replace stored values with unverified ones. A group holding only a minor field (a camera
 * with just `rear_setup`) is not complete, so the master still gets its call.
 */
export function specificationsCompleteForCategory(
  specifications: unknown,
  categorySlug: string | null | undefined
): boolean {
  if (!isRecord(specifications)) return false;
  const required = getCategorySpecTemplate(categorySlug).groups.filter(
    group => !OPTIONAL_GROUPS.has(group)
  );
  if (required.length === 0) return false;
  return required.every(group => keyFieldPresent(group, specifications[group]));
}
