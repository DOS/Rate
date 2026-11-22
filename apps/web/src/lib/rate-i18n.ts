import type csMessages from '../../locales/cs.json';
import type enMessages from '../../locales/en.json';
import type viMessages from '../../locales/vi.json';

export type SupportedRateLocale = 'vi' | 'en' | 'cs';
export type RateLocale = SupportedRateLocale;

export function normalizeRateLocale(
  locale?: string | null
): SupportedRateLocale {
  if (typeof locale !== 'string') {
    return 'vi';
  }
  const cleaned = locale
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, 32)
    .toLowerCase();
  const primary = cleaned.split(/[-_]/)[0];
  if (primary === 'en' || primary === 'cs') {
    return primary;
  }
  return 'vi';
}

// All UI copy lives in the next-intl catalogs (locales/*.json), the single
// source of truth for every locale. Pure type-level constraints fail `tsc`
// whenever any locale catalog misses or adds a key relative to `vi.json`,
// while emitting zero runtime JSON into client JavaScript bundles (#1863).
type AssertAssignable<_Target, _Source extends _Target> = true;

export type AssertCatalogParity = [
  AssertAssignable<typeof viMessages, typeof enMessages>,
  AssertAssignable<typeof enMessages, typeof viMessages>,
  AssertAssignable<typeof viMessages, typeof csMessages>,
  AssertAssignable<typeof csMessages, typeof viMessages>,
];
