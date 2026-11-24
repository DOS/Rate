'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  BsCheckCircle,
  BsDownload,
  BsExclamationTriangle,
  BsLink45Deg,
  BsPlus,
  BsShieldCheck,
  BsShop,
  BsX,
} from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import ContentText from '@/components/elementary/ContentText';
import {
  OG_COMBO_SHIPPING_PRESETS,
  SHARE_IMAGE,
  buildOgTruthCardPath,
  isOgComboMaxStores,
  isOgComboMinTrust,
  isOgComboShippingPreset,
} from '@/lib/seo';
import type { MasterProduct } from '@repo/shared-data';
import type { WatchlistItem } from './watchlist-store';
import {
  COMBO_CART_DEFAULT_MAX_STORES,
  COMBO_CART_DEFAULT_MIN_TRUST,
  COMBO_CART_DEFAULT_SHIPPING_VND,
  COMBO_CART_MAX_ITEMS,
  COMBO_CART_MAX_MAX_STORES,
  COMBO_CART_MAX_SHIPPING_VND,
  COMBO_CART_MIN_ITEMS,
  COMBO_CART_MIN_MAX_STORES,
  type ComboCartDiagnostics,
  type ComboCartPlan,
  type ComboCartStoreGroup,
} from '@/lib/combo-cart-optimizer';
import type { MerchantTrustBadgeResult } from '@/lib/merchant-trust-badge';
import { isCanonicalCategorySlug } from '@/lib/rate-domain-core';
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPriceVnd,
} from '@/lib/locale-format';

export interface ComboCartApiMerchantBadge extends MerchantTrustBadgeResult {
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  platform: string;
  auditScope: 'merchant_wide' | 'cart_only_unverified';
  cartOfferCount: number;
  cartFakeDiscountCount: number;
}

export interface ComboCartApiStoreGroup extends ComboCartStoreGroup {
  trustBadge: ComboCartApiMerchantBadge;
}

export interface ComboCartApiPlan extends Omit<ComboCartPlan, 'storeGroups'> {
  storeGroups: ComboCartApiStoreGroup[];
}

export interface ComboCartApiItemSummary {
  requestedSlug: string;
  resolvedSlug: string | null;
  itemSlug: string | null;
  masterProductId: string | null;
  name: string;
  brand: string | null;
  categorySlug: string | null;
  productHref: string | null;
  sizeRequired: boolean;
  retiredVariant: boolean;
  found: boolean;
  offerCount: number;
}

export interface ComboCartApiPayload {
  query: {
    items: string[];
    officialOnly: boolean;
    minTrust: number;
    maxStores: number;
    shippingVnd: number;
  };
  items: ComboCartApiItemSummary[];
  missingSlugs: string[];
  singleStoreBest: ComboCartApiPlan | null;
  multiStoreOptimal: ComboCartApiPlan | null;
  savingsVsSingleStoreVnd: number;
  savingsVsSingleStorePct: number;
  cheapestPerItemSubtotalVnd: number | null;
  uncoveredSlugs: string[];
  merchantBadges: ComboCartApiMerchantBadge[];
  diagnostics: ComboCartDiagnostics;
}

export interface ComboCartQueryState {
  items: string[];
  officialOnly: boolean;
  minTrust: number;
  maxStores: number;
  shippingVnd: number;
}

const VALID_ITEM_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UNSAFE_SLUG_TOKENS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  'infinity',
  '-infinity',
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

const DEFAULT_QUERY_STATE: ComboCartQueryState = {
  items: [],
  officialOnly: false,
  minTrust: COMBO_CART_DEFAULT_MIN_TRUST,
  maxStores: COMBO_CART_DEFAULT_MAX_STORES,
  shippingVnd: COMBO_CART_DEFAULT_SHIPPING_VND,
};

export function isSafeComboSlugToken(token: unknown): token is string {
  if (typeof token !== 'string' || !VALID_ITEM_SLUG_REGEX.test(token)) {
    return false;
  }
  const lower = token.toLowerCase();
  if (
    /^0+$/.test(token) ||
    token.endsWith('.') ||
    token.includes('..') ||
    Object.prototype.hasOwnProperty.call(Object.prototype, token) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, lower) ||
    UNSAFE_SLUG_TOKENS.has(lower)
  ) {
    return false;
  }
  return true;
}

/**
 * Parses comma-separated `?items=slug1,slug2,...` safely, deduplicating
 * case-insensitively and capping at `COMBO_CART_MAX_ITEMS` (5).
 */
export function parseComboCartItemsQueryParam(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  if (/[\p{Cc}]/u.test(raw)) return [];
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 1000) return [];
  const unique: string[] = [];
  const seenLower = new Set<string>();
  for (const part of trimmed.split(',')) {
    const token = part.replace(/\p{Cc}+/gu, '').trim();
    if (!isSafeComboSlugToken(token)) continue;
    const lower = token.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    unique.push(token);
    if (unique.length >= COMBO_CART_MAX_ITEMS) break;
  }
  return unique;
}

export function clampComboMinTrust(raw: unknown): number {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' &&
          raw.trim() !== '' &&
          !/^[+-]?0[xbo]/i.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;
  if (!Number.isFinite(num)) return COMBO_CART_DEFAULT_MIN_TRUST;
  const clamped = Math.max(0, Math.min(100, Math.round(num)));
  return clamped === 0 ? 0 : clamped;
}

export function clampComboMaxStores(raw: unknown): number {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' &&
          raw.trim() !== '' &&
          !/^[+-]?0[xbo]/i.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;
  if (!Number.isFinite(num)) return COMBO_CART_DEFAULT_MAX_STORES;
  return Math.max(
    COMBO_CART_MIN_MAX_STORES,
    Math.min(COMBO_CART_MAX_MAX_STORES, Math.trunc(num))
  );
}

export function clampComboShippingVnd(raw: unknown): number {
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' &&
          raw.trim() !== '' &&
          !/^[+-]?0[xbo]/i.test(raw.trim())
        ? Number(raw.trim())
        : Number.NaN;
  if (!Number.isFinite(num)) return COMBO_CART_DEFAULT_SHIPPING_VND;
  const clamped = Math.max(
    0,
    Math.min(COMBO_CART_MAX_SHIPPING_VND, Math.round(num))
  );
  return clamped === 0 ? 0 : clamped;
}

export function parseComboCartQueryState(
  searchParams: Pick<URLSearchParams, 'get'>
): ComboCartQueryState {
  const items = parseComboCartItemsQueryParam(searchParams.get('items'));
  const rawOfficial = (searchParams.get('officialOnly') ?? '').trim();
  const officialOnly = rawOfficial === '1' || rawOfficial === 'true';
  const minTrust = clampComboMinTrust(searchParams.get('minTrust'));
  const maxStores = clampComboMaxStores(searchParams.get('maxStores'));
  const shippingVnd = clampComboShippingVnd(searchParams.get('shippingVnd'));
  return { items, officialOnly, minTrust, maxStores, shippingVnd };
}

/**
 * Updates combo query params inside an existing search string without clobbering
 * `?add=`, `?target=`, `?unsubscribe=`, or other parameters unless `stripTransient`
 * is enabled (used when creating a shareable URL).
 */
export function mergeComboCartSearchParams(
  existingSearch: string,
  state: ComboCartQueryState,
  options?: { stripTransient?: boolean }
): URLSearchParams {
  const params = new URLSearchParams(existingSearch);
  if (options?.stripTransient) {
    params.delete('add');
    params.delete('target');
    params.delete('unsubscribe');
  }
  const cleanItems = parseComboCartItemsQueryParam(state.items.join(','));
  if (cleanItems.length > 0) {
    params.set('items', cleanItems.join(','));
  } else {
    params.delete('items');
  }
  if (state.officialOnly) {
    params.set('officialOnly', '1');
  } else {
    params.delete('officialOnly');
  }
  const safeMinTrust = clampComboMinTrust(state.minTrust);
  if (safeMinTrust !== COMBO_CART_DEFAULT_MIN_TRUST) {
    params.set('minTrust', String(safeMinTrust));
  } else {
    params.delete('minTrust');
  }
  const safeMaxStores = clampComboMaxStores(state.maxStores);
  if (safeMaxStores !== COMBO_CART_DEFAULT_MAX_STORES) {
    params.set('maxStores', String(safeMaxStores));
  } else {
    params.delete('maxStores');
  }
  const safeShipping = clampComboShippingVnd(state.shippingVnd);
  if (safeShipping !== COMBO_CART_DEFAULT_SHIPPING_VND) {
    params.set('shippingVnd', String(safeShipping));
  } else {
    params.delete('shippingVnd');
  }
  return params;
}

export function buildComboCartApiUrl(state: ComboCartQueryState): string {
  const cleanItems = parseComboCartItemsQueryParam(state.items.join(','));
  const params = new URLSearchParams();
  params.set('items', cleanItems.join(','));
  params.set('officialOnly', state.officialOnly ? '1' : '0');
  params.set('minTrust', String(clampComboMinTrust(state.minTrust)));
  params.set('maxStores', String(clampComboMaxStores(state.maxStores)));
  params.set('shippingVnd', String(clampComboShippingVnd(state.shippingVnd)));
  return `/api/v1/rate/combo-cart?${params.toString()}`;
}

export function sanitizeComboOfferHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^\d+(?:\.\d+){3}$/.test(host)
    ) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeComboProductHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\p{Cc}+/gu, '').trim();
  const match = /^\/([a-z]+)\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$/.exec(
    trimmed
  );
  if (!match) return null;
  const category = match[1]!;
  const slug = match[2]!;
  if (!isCanonicalCategorySlug(category) || !isSafeComboSlugToken(slug)) {
    return null;
  }
  return `/${category}/${slug}`;
}

export function formatComboTrustScore(
  score: number | null | undefined,
  locale: string
): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const clamped = Math.max(0, Math.min(100, score));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded)
    ? formatNumber(rounded, locale)
    : formatDecimal(rounded, locale, 1);
}

const PLATFORM_DISPLAY: Record<string, string> = {
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiki: 'Tiki',
  tiktok: 'TikTok Shop',
  cellphones: 'CellphoneS',
  tgdd: 'Thế Giới Di Động',
  fptshop: 'FPT Shop',
  hoangha: 'Hoàng Hà Mobile',
  didongviet: 'Di Động Việt',
  phongvu: 'Phong Vũ',
  dienmayxanh: 'Điện Máy Xanh',
  topzone: 'TopZone',
  gearvn: 'GearVN',
  nguyenkim: 'Nguyễn Kim',
  shopdunk: 'ShopDunk',
  hacom: 'HACOM',
  clickbuy: 'Clickbuy',
  viettelstore: 'Viettel Store',
  pico: 'Pico',
  mediamart: 'MediaMart',
  memoryzone: 'MemoryZone',
  anphatpc: 'An Phát Computer',
};

const VIETNAMESE_PLATFORMS = new Set([
  'tgdd',
  'hoangha',
  'didongviet',
  'phongvu',
  'dienmayxanh',
  'nguyenkim',
  'anphatpc',
]);

function displayPlatformLabel(platform: string): string {
  const lower = platform.trim().toLowerCase();
  return Object.hasOwn(PLATFORM_DISPLAY, lower)
    ? PLATFORM_DISPLAY[lower]!
    : platform.toUpperCase();
}

export type ComboFetchErrorKey =
  'comboRateLimitError' | 'comboInvalidRequestError' | 'comboFetchError';

export function resolveComboHttpErrorKey(status: number): ComboFetchErrorKey {
  if (status === 429) return 'comboRateLimitError';
  if (status === 400) return 'comboInvalidRequestError';
  return 'comboFetchError';
}

export function resolveComboCatchErrorKey(
  err: unknown,
  aborted = false
): 'comboFetchError' | null {
  if (
    aborted ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name?: unknown }).name === 'AbortError')
  ) {
    return null;
  }
  return 'comboFetchError';
}

export type ComboUrlSyncDecision = 'skip_initial' | 'apply';

export function resolveComboUrlSyncDecision(params: {
  readonly initialSkippedUrl: string | null;
  readonly nextUrlKey: string;
  readonly allowReset: boolean;
}): ComboUrlSyncDecision {
  if (
    params.initialSkippedUrl !== null &&
    !params.allowReset &&
    params.nextUrlKey === params.initialSkippedUrl
  ) {
    return 'skip_initial';
  }
  return 'apply';
}

export function shouldShowComboBoundedSearchNote(
  result: Pick<
    ComboCartApiPayload,
    'singleStoreBest' | 'multiStoreOptimal' | 'diagnostics'
  >
): boolean {
  return (
    !result.diagnostics.searchComplete &&
    Boolean(result.singleStoreBest || result.multiStoreOptimal)
  );
}

export function doesComboResultMatchQueryState(
  result: Pick<ComboCartApiPayload, 'query'> | null | undefined,
  state: ComboCartQueryState
): boolean {
  if (!result?.query) return false;
  if (
    Boolean(result.query.officialOnly) !== Boolean(state.officialOnly) ||
    result.query.minTrust !== state.minTrust ||
    result.query.maxStores !== state.maxStores ||
    result.query.shippingVnd !== state.shippingVnd
  ) {
    return false;
  }
  if (
    !Array.isArray(result.query.items) ||
    result.query.items.length !== state.items.length
  ) {
    return false;
  }
  for (let i = 0; i < state.items.length; i++) {
    if (
      (result.query.items[i] ?? '').toLowerCase() !==
      (state.items[i] ?? '').toLowerCase()
    ) {
      return false;
    }
  }
  return true;
}

export interface ComboOgExportEligibility {
  readonly canExport: boolean;
  readonly minTrustValid: boolean;
  readonly shippingPresetValid: boolean;
  readonly maxStoresValid: boolean;
  readonly resultMatchesUi: boolean;
  readonly downloadUrl: string | null;
}

export function evaluateComboOgExportEligibility(params: {
  readonly state: ComboCartQueryState;
  readonly loading: boolean;
  readonly fetchError: string | null;
  readonly result: ComboCartApiPayload | null;
  readonly locale: string;
}): ComboOgExportEligibility {
  const { state, loading, fetchError, result, locale } = params;
  const hasEnoughItems =
    state.items.length >= COMBO_CART_MIN_ITEMS &&
    state.items.length <= COMBO_CART_MAX_ITEMS;
  const minTrustValid = isOgComboMinTrust(state.minTrust);
  const shippingPresetValid = isOgComboShippingPreset(state.shippingVnd);
  const maxStoresValid = isOgComboMaxStores(state.maxStores);
  const resultMatchesUi =
    !loading &&
    !fetchError &&
    result !== null &&
    result.missingSlugs.length === 0 &&
    result.items.filter((item) => item.found).length >= COMBO_CART_MIN_ITEMS &&
    doesComboResultMatchQueryState(result, state);

  const eligible =
    hasEnoughItems &&
    minTrustValid &&
    shippingPresetValid &&
    maxStoresValid &&
    resultMatchesUi;

  if (!eligible) {
    return {
      canExport: false,
      minTrustValid,
      shippingPresetValid,
      maxStoresValid,
      resultMatchesUi,
      downloadUrl: null,
    };
  }

  const url = buildOgTruthCardPath({
    type: 'combo',
    items: state.items,
    officialOnly: state.officialOnly,
    minTrust: state.minTrust,
    maxStores: state.maxStores,
    shippingVnd: state.shippingVnd,
    format: 'social',
    download: true,
    locale,
  });

  if (!url || url === SHARE_IMAGE.url) {
    return {
      canExport: false,
      minTrustValid,
      shippingPresetValid,
      maxStoresValid,
      resultMatchesUi,
      downloadUrl: null,
    };
  }

  return {
    canExport: true,
    minTrustValid,
    shippingPresetValid,
    maxStoresValid,
    resultMatchesUi,
    downloadUrl: url,
  };
}

function hasAnyComboParam(searchParams: Pick<URLSearchParams, 'has'>): boolean {
  return (
    searchParams.has('items') ||
    searchParams.has('officialOnly') ||
    searchParams.has('minTrust') ||
    searchParams.has('maxStores') ||
    searchParams.has('shippingVnd')
  );
}

/**
 * Listens to App Router query changes inside a Suspense boundary so soft
 * <Link href="/watchlist?items=..."> navigations hydrate combo state without
 * interfering with cached static rendering.
 */
function ComboParamsFromUrl({
  lastSyncedApiUrlRef,
  onUrlState,
}: {
  readonly lastSyncedApiUrlRef: React.RefObject<string | null>;
  readonly onUrlState: (next: ComboCartQueryState) => void;
}) {
  const searchParams = useSearchParams();
  const hasCombo = hasAnyComboParam(searchParams);
  const parsed = parseComboCartQueryState(searchParams);
  const parsedKey = buildComboCartApiUrl(parsed);
  const hadComboRef = useRef(hasCombo);

  useEffect(() => {
    if (!hasCombo && !hadComboRef.current) return;
    hadComboRef.current = hasCombo;
    if (lastSyncedApiUrlRef.current === parsedKey) return;
    lastSyncedApiUrlRef.current = parsedKey;
    onUrlState(hasCombo ? parsed : DEFAULT_QUERY_STATE);
  }, [hasCombo, lastSyncedApiUrlRef, onUrlState, parsed, parsedKey]);

  return null;
}

export interface WatchlistComboOptimizerProps {
  watchedItems: readonly WatchlistItem[];
  catalogProducts: readonly MasterProduct[];
  locale: string;
  /** SSR / unit-test overrides */
  initialSelectedSlugs?: readonly string[];
  initialOptions?: Partial<Omit<ComboCartQueryState, 'items'>>;
  initialResult?: ComboCartApiPayload | null;
}

export default function WatchlistComboOptimizer({
  watchedItems,
  catalogProducts,
  locale,
  initialSelectedSlugs,
  initialOptions,
  initialResult,
}: WatchlistComboOptimizerProps) {
  const t = useTranslations('watchlist');
  const sectionId = useId();

  const initialCleanSlugs = useMemo(
    () =>
      initialSelectedSlugs
        ? parseComboCartItemsQueryParam(initialSelectedSlugs.join(','))
        : [],
    [initialSelectedSlugs]
  );

  const initialStateSnapshot = useMemo<ComboCartQueryState>(
    () => ({
      items: initialCleanSlugs,
      officialOnly: Boolean(initialOptions?.officialOnly),
      minTrust:
        initialOptions?.minTrust !== undefined
          ? clampComboMinTrust(initialOptions.minTrust)
          : DEFAULT_QUERY_STATE.minTrust,
      maxStores:
        initialOptions?.maxStores !== undefined
          ? clampComboMaxStores(initialOptions.maxStores)
          : DEFAULT_QUERY_STATE.maxStores,
      shippingVnd:
        initialOptions?.shippingVnd !== undefined
          ? clampComboShippingVnd(initialOptions.shippingVnd)
          : DEFAULT_QUERY_STATE.shippingVnd,
    }),
    [initialCleanSlugs, initialOptions]
  );

  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    initialStateSnapshot.items
  );
  const [officialOnly, setOfficialOnly] = useState<boolean>(
    initialStateSnapshot.officialOnly
  );
  const [minTrust, setMinTrust] = useState<number>(
    initialStateSnapshot.minTrust
  );
  const [maxStores, setMaxStores] = useState<number>(
    initialStateSnapshot.maxStores
  );
  const [shippingVnd, setShippingVnd] = useState<number>(
    initialStateSnapshot.shippingVnd
  );
  const [shippingDraft, setShippingDraft] = useState<string>(
    String(initialStateSnapshot.shippingVnd)
  );

  const [customInput, setCustomInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [result, setResult] = useState<ComboCartApiPayload | null>(
    initialResult ?? null
  );

  // Store the exact initial query URL key so StrictMode double-mounts skip the
  // initial SSR-hydrated fetch deterministically without mutating a one-shot boolean.
  const initialSkippedUrlRef = useRef<string | null>(
    initialResult && initialStateSnapshot.items.length >= COMBO_CART_MIN_ITEMS
      ? buildComboCartApiUrl(initialStateSnapshot)
      : null
  );
  const lastSyncedApiUrlRef = useRef<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const applyUrlState = useCallback(
    (
      parsed: ComboCartQueryState,
      options?: { readonly allowReset?: boolean }
    ) => {
      const nextKey = buildComboCartApiUrl(parsed);
      if (
        resolveComboUrlSyncDecision({
          initialSkippedUrl: initialSkippedUrlRef.current,
          nextUrlKey: nextKey,
          allowReset: Boolean(options?.allowReset),
        }) === 'skip_initial'
      ) {
        return;
      }
      initialSkippedUrlRef.current = null;
      setSelectedSlugs(parsed.items);
      setOfficialOnly(parsed.officialOnly);
      setMinTrust(parsed.minTrust);
      setMaxStores(parsed.maxStores);
      setShippingVnd(parsed.shippingVnd);
      setShippingDraft(String(parsed.shippingVnd));
    },
    []
  );

  // Hydrate `?items=...` on client mount and stay synced on browser Back/Forward
  // without clobbering `?add=`, `?target=`, `?unsubscribe=`, or `history.state`.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromWindowLocation = (allowReset: boolean) => {
      const sp = new URLSearchParams(window.location.search);
      const hasCombo = hasAnyComboParam(sp);
      if (!hasCombo && !allowReset) return;
      const parsed = hasCombo
        ? parseComboCartQueryState(sp)
        : DEFAULT_QUERY_STATE;
      const nextKey = buildComboCartApiUrl(parsed);
      lastSyncedApiUrlRef.current = nextKey;
      applyUrlState(parsed, { allowReset });
    };

    syncFromWindowLocation(false);
    const onPopState = () => syncFromWindowLocation(true);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [applyUrlState]);

  const syncComboUrlState = useCallback((nextState: ComboCartQueryState) => {
    if (typeof window === 'undefined') return;
    const now = new URL(window.location.href);
    const nextParams = mergeComboCartSearchParams(now.search, nextState, {
      stripTransient: false,
    });
    lastSyncedApiUrlRef.current = buildComboCartApiUrl(nextState);
    const qs = nextParams.toString();
    const nextHref = `${now.pathname}${qs ? `?${qs}` : ''}${now.hash}`;
    window.history.replaceState(window.history.state, '', nextHref);
  }, []);

  const applyComboUpdate = useCallback(
    (patch: Partial<ComboCartQueryState>) => {
      const nextState: ComboCartQueryState = {
        items: patch.items ?? selectedSlugs,
        officialOnly: patch.officialOnly ?? officialOnly,
        minTrust: patch.minTrust ?? minTrust,
        maxStores: patch.maxStores ?? maxStores,
        shippingVnd: patch.shippingVnd ?? shippingVnd,
      };
      initialSkippedUrlRef.current = null;
      if (patch.items !== undefined) setSelectedSlugs(nextState.items);
      if (patch.officialOnly !== undefined) {
        setOfficialOnly(nextState.officialOnly);
      }
      if (patch.minTrust !== undefined) setMinTrust(nextState.minTrust);
      if (patch.maxStores !== undefined) setMaxStores(nextState.maxStores);
      if (patch.shippingVnd !== undefined) {
        setShippingVnd(nextState.shippingVnd);
      }
      syncComboUrlState(nextState);
    },
    [
      maxStores,
      minTrust,
      officialOnly,
      selectedSlugs,
      shippingVnd,
      syncComboUrlState,
    ]
  );

  // Fetch optimized plans from GET /api/v1/rate/combo-cart with AbortController
  useEffect(() => {
    if (selectedSlugs.length < COMBO_CART_MIN_ITEMS) {
      setLoading(false);
      setFetchError(null);
      if (initialSkippedUrlRef.current === null) {
        setResult(null);
      }
      return;
    }

    const requestUrl = buildComboCartApiUrl({
      items: selectedSlugs,
      officialOnly,
      minTrust,
      maxStores,
      shippingVnd,
    });

    if (
      initialSkippedUrlRef.current !== null &&
      requestUrl === initialSkippedUrlRef.current &&
      retryNonce === 0
    ) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setFetchError(null);
      void fetch(requestUrl, { signal: controller.signal })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as {
            ok?: boolean;
            data?: ComboCartApiPayload;
          } | null;
          if (controller.signal.aborted) return;
          if (!res.ok || !json?.ok || !json.data) {
            setFetchError(t(resolveComboHttpErrorKey(res.status)));
            return;
          }
          setResult(json.data);
          setFetchError(null);
        })
        .catch((err: unknown) => {
          const errKey = resolveComboCatchErrorKey(
            err,
            controller.signal.aborted
          );
          if (errKey) {
            setFetchError(t(errKey));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    maxStores,
    minTrust,
    officialOnly,
    retryNonce,
    selectedSlugs,
    shippingVnd,
    t,
  ]);

  const productNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of catalogProducts) {
      if (p.slug) map.set(p.slug.toLowerCase(), p.name);
    }
    for (const w of watchedItems) {
      if (w.slug) map.set(w.slug.toLowerCase(), w.name);
    }
    if (result?.items) {
      for (const item of result.items) {
        if (item.found && item.requestedSlug) {
          map.set(item.requestedSlug.toLowerCase(), item.name);
        }
      }
    }
    return map;
  }, [catalogProducts, result, watchedItems]);

  const quickPickCandidates = useMemo(() => {
    const out: Array<{
      slug: string;
      name: string;
      fromWatchlist: boolean;
      minPrice: number;
    }> = [];
    const seen = new Set<string>();
    const addCandidate = (
      slug: string,
      name: string,
      fromWatchlist: boolean,
      minPrice: number
    ) => {
      if (!isSafeComboSlugToken(slug)) return;
      const lower = slug.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      out.push({ slug, name: name || slug, fromWatchlist, minPrice });
    };

    for (const w of watchedItems) {
      addCandidate(w.slug, w.name, true, w.priceWhenAdded || 0);
    }
    for (const p of catalogProducts) {
      if (out.length >= 12) break;
      addCandidate(p.slug, p.name, false, Number(p.min_price || 0));
    }
    return out;
  }, [catalogProducts, watchedItems]);

  const selectedLowerSet = useMemo(
    () => new Set(selectedSlugs.map((s) => s.toLowerCase())),
    [selectedSlugs]
  );

  const handleToggleSlug = (slug: string) => {
    setInputError(null);
    const lower = slug.toLowerCase();
    if (selectedLowerSet.has(lower)) {
      applyComboUpdate({
        items: selectedSlugs.filter((s) => s.toLowerCase() !== lower),
      });
      return;
    }
    if (!isSafeComboSlugToken(slug)) {
      setInputError(t('comboInvalidSlugError'));
      return;
    }
    if (selectedSlugs.length >= COMBO_CART_MAX_ITEMS) {
      setInputError(t('comboMaxItemsError', { max: COMBO_CART_MAX_ITEMS }));
      return;
    }
    applyComboUpdate({ items: [...selectedSlugs, slug] });
  };

  const handleAddCustomSlug = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);
    const raw = customInput.trim();
    if (!raw) return;

    // Allow picking by exact product name or slug from catalog/watchlist.
    const matchedCatalog =
      catalogProducts.find(
        (p) =>
          p.slug.toLowerCase() === raw.toLowerCase() ||
          p.name.toLowerCase() === raw.toLowerCase()
      ) ??
      watchedItems.find(
        (w) =>
          w.slug.toLowerCase() === raw.toLowerCase() ||
          w.name.toLowerCase() === raw.toLowerCase()
      );
    const candidateSlug = matchedCatalog?.slug ?? raw;

    if (!isSafeComboSlugToken(candidateSlug)) {
      setInputError(t('comboInvalidSlugError'));
      return;
    }
    if (selectedLowerSet.has(candidateSlug.toLowerCase())) {
      setInputError(t('comboDuplicateSlugError'));
      return;
    }
    if (selectedSlugs.length >= COMBO_CART_MAX_ITEMS) {
      setInputError(t('comboMaxItemsError', { max: COMBO_CART_MAX_ITEMS }));
      return;
    }
    applyComboUpdate({ items: [...selectedSlugs, candidateSlug] });
    setCustomInput('');
  };

  const handleClearSelection = () => {
    setInputError(null);
    setResult(null);
    setFetchError(null);
    applyComboUpdate({ items: [] });
  };

  const handleCopyShareLink = async () => {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.clipboard?.writeText ||
      selectedSlugs.length === 0
    ) {
      return;
    }
    const now = new URL(window.location.href);
    const params = mergeComboCartSearchParams(
      now.search,
      {
        items: selectedSlugs,
        officialOnly,
        minTrust,
        maxStores,
        shippingVnd,
      },
      { stripTransient: true }
    );
    const qs = params.toString();
    const shareUrl = `${now.origin}${now.pathname}${qs ? `?${qs}` : ''}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(
        () => setCopiedShareLink(false),
        2200
      );
    } catch {
      // Clipboard write unavailable
    }
  };

  const handleRetry = () => {
    if (selectedSlugs.length < COMBO_CART_MIN_ITEMS) return;
    initialSkippedUrlRef.current = null;
    setRetryNonce((n) => n + 1);
  };

  const ogExport = useMemo(
    () =>
      evaluateComboOgExportEligibility({
        state: {
          items: selectedSlugs,
          officialOnly,
          minTrust,
          maxStores,
          shippingVnd,
        },
        loading,
        fetchError,
        result,
        locale,
      }),
    [
      fetchError,
      loading,
      locale,
      maxStores,
      minTrust,
      officialOnly,
      result,
      selectedSlugs,
      shippingVnd,
    ]
  );

  const showOgGatingHint =
    selectedSlugs.length >= COMBO_CART_MIN_ITEMS &&
    (!ogExport.minTrustValid || !ogExport.shippingPresetValid);

  const snappedMinTrust = Math.max(
    0,
    Math.min(100, Math.round(minTrust / 5) * 5)
  );

  const handleDownloadComboPng = () => {
    if (
      typeof window === 'undefined' ||
      !ogExport.canExport ||
      !ogExport.downloadUrl
    ) {
      return;
    }
    const a = document.createElement('a');
    a.href = ogExport.downloadUrl;
    a.download = 'rate-truth-card-combo-4x5.png';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const retiredItems = useMemo(
    () => (result?.items ?? []).filter((item) => item.retiredVariant),
    [result]
  );

  const uncoveredDetails = useMemo(() => {
    if (!result) return [];
    const bySlug = new Map(
      result.items.map((item) => [item.requestedSlug.toLowerCase(), item])
    );
    const seen = new Set<string>();
    const out: Array<{
      slug: string;
      name: string;
      retiredVariant: boolean;
      missing: boolean;
      productHref: string | null;
    }> = [];
    const pushDiag = (rawSlug: string) => {
      const lower = rawSlug.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      const summary = bySlug.get(lower);
      out.push({
        slug: rawSlug,
        name: summary?.name ?? productNameBySlug.get(lower) ?? rawSlug,
        retiredVariant: Boolean(summary?.retiredVariant),
        missing: summary
          ? !summary.found
          : result.missingSlugs.includes(rawSlug),
        productHref: sanitizeComboProductHref(summary?.productHref),
      });
    };
    for (const slug of result.uncoveredSlugs) pushDiag(slug);
    for (const item of result.items) {
      if (item.retiredVariant) pushDiag(item.requestedSlug);
    }
    return out;
  }, [productNameBySlug, result]);

  const renderPlanCard = (
    plan: ComboCartApiPlan | null,
    variant: 'single' | 'multi'
  ) => {
    const isSingle = variant === 'single';
    const title = isSingle ? t('comboPlanATitle') : t('comboPlanBTitle');
    const subtitle = isSingle
      ? t('comboPlanASubtitle')
      : t('comboPlanBSubtitle');
    const emptyText = isSingle
      ? t('comboPlanAEmpty')
      : result && !result.diagnostics.searchComplete
        ? t('comboPlanBIncomplete')
        : t('comboPlanBEmpty');
    const isMultiWinner =
      !isSingle &&
      Boolean(plan) &&
      Boolean(
        result?.savingsVsSingleStoreVnd && result.savingsVsSingleStoreVnd > 0
      );

    return (
      <div className="col-lg-6 col-12">
        <div
          data-testid={
            isSingle ? 'combo-plan-single-store' : 'combo-plan-multi-store'
          }
          className="rounded-4 d-flex flex-column h-100 p-3"
          style={{
            backgroundColor: 'var(--rate-bg-surface)',
            border: isMultiWinner
              ? '1px solid var(--rate-ink-success)'
              : '1px solid var(--rate-glass-border)',
          }}
        >
          <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div>
              <span
                className="badge rounded-pill mb-2"
                style={{
                  backgroundColor: isSingle
                    ? 'var(--rate-glass-bg)'
                    : 'var(--rate-score-user-bg)',
                  color: isSingle
                    ? 'var(--rate-fg-primary)'
                    : 'var(--rate-ink-success)',
                  border: isSingle
                    ? '1px solid var(--rate-border-strong)'
                    : '1px solid var(--rate-ink-success)',
                }}
              >
                {isSingle ? t('comboPlanABadge') : t('comboPlanBBadge')}
              </span>
              <h3 className="h5 fw-bold mb-1 text-white">{title}</h3>
              <p
                className="small mb-0"
                style={{ color: 'var(--rate-fg-secondary)' }}
              >
                {subtitle}
              </p>
            </div>
            {plan && (
              <div className="text-end">
                <div
                  className="h4 fw-bold rate-tabular mb-0"
                  style={{
                    color: isMultiWinner
                      ? 'var(--rate-ink-success)'
                      : 'var(--rate-fg-primary)',
                  }}
                >
                  {formatPriceVnd(plan.totalVnd, locale)}
                </div>
                <div
                  className="small rate-tabular"
                  style={{ color: 'var(--rate-fg-secondary)' }}
                >
                  {t('comboStoresCount', { count: plan.distinctStoreCount })}
                </div>
              </div>
            )}
          </div>

          {!plan ? (
            <div
              className="rounded-3 small mt-auto p-3"
              style={{
                backgroundColor: 'var(--rate-glass-bg)',
                border: '1px solid var(--rate-glass-border)',
                color: 'var(--rate-fg-secondary)',
              }}
            >
              {emptyText}
            </div>
          ) : (
            <>
              <div
                className="rounded-3 d-flex justify-content-between align-items-center small rate-tabular mb-3 flex-wrap gap-2 px-3 py-2"
                style={{
                  backgroundColor: 'var(--rate-glass-bg)',
                  border: '1px solid var(--rate-glass-border)',
                }}
              >
                <span>
                  {t('comboSubtotalLabel')}{' '}
                  <strong className="text-white">
                    {formatPriceVnd(plan.itemsSubtotalVnd, locale)}
                  </strong>
                </span>
                <span>
                  {t('comboShippingLabel')}{' '}
                  <strong className="text-white">
                    {formatPriceVnd(plan.shippingVnd, locale)}
                  </strong>
                </span>
                {plan.avgTrustScore !== null && (
                  <span>
                    {t('comboAvgTrustLabel')}{' '}
                    <strong className="text-white">
                      {formatComboTrustScore(plan.avgTrustScore, locale)}/100
                    </strong>
                  </span>
                )}
              </div>

              <div className="d-flex flex-column gap-3">
                {plan.storeGroups.map((group) => {
                  const groupTrust = formatComboTrustScore(
                    group.trustScore,
                    locale
                  );
                  const isVerifiedSafe = Boolean(
                    group.trustBadge?.verifiedSafe
                  );
                  return (
                    <div
                      key={`${variant}-${group.storeKey}`}
                      className="rounded-3 p-3"
                      style={{
                        backgroundColor: 'var(--rate-bg-elevated)',
                        border: '1px solid var(--rate-glass-border)',
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div>
                          <div className="d-flex align-items-center flex-wrap gap-2">
                            <span
                              className="badge bg-danger text-uppercase"
                              lang={
                                locale !== 'vi' &&
                                VIETNAMESE_PLATFORMS.has(
                                  group.platform.toLowerCase()
                                )
                                  ? 'vi'
                                  : undefined
                              }
                            >
                              {displayPlatformLabel(group.platform)}
                            </span>
                            <span className="fw-semibold text-white">
                              <ContentText
                                text={group.merchantName}
                                locale={locale}
                              />
                            </span>
                            {group.isOfficial && (
                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor:
                                    'var(--rate-score-expert-bg)',
                                  color: 'var(--rate-ink-info)',
                                  border: '1px solid var(--rate-ink-info)',
                                }}
                              >
                                {t('officialMallBadge')}
                              </span>
                            )}
                            {isVerifiedSafe && (
                              <span
                                className="badge rounded-pill d-inline-flex align-items-center gap-1"
                                data-testid="combo-verified-safe-badge"
                                style={{
                                  backgroundColor: 'var(--rate-score-user-bg)',
                                  color: 'var(--rate-ink-success)',
                                  border: '1px solid var(--rate-ink-success)',
                                }}
                              >
                                <BsShieldCheck aria-hidden="true" />
                                {t('comboVerifiedSafeBadge')}
                              </span>
                            )}
                          </div>
                          <div
                            className="small mt-1"
                            style={{ color: 'var(--rate-fg-secondary)' }}
                          >
                            <BsShop aria-hidden="true" className="me-1" />
                            {groupTrust !== null
                              ? t('comboStoreTrust', { score: groupTrust })
                              : t('comboStoreTrustUnknown')}
                          </div>
                        </div>
                        <div className="text-end rate-tabular">
                          <div className="fw-bold text-white">
                            {formatPriceVnd(group.storeTotalVnd, locale)}
                          </div>
                          {group.shippingVnd > 0 && (
                            <div
                              className="small"
                              style={{ color: 'var(--rate-fg-secondary)' }}
                            >
                              {t('comboStoreShippingNote', {
                                price: formatPriceVnd(
                                  group.shippingVnd,
                                  locale
                                ),
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <ul className="list-unstyled mb-0 d-flex flex-column gap-2 border-top border-secondary border-opacity-25 pt-2">
                        {group.items.map((alloc) => {
                          const safeHref = sanitizeComboOfferHref(
                            alloc.offerUrl
                          );
                          return (
                            <li
                              key={`${group.storeKey}-${alloc.itemSlug}-${alloc.offerId}`}
                              className="d-flex justify-content-between align-items-center flex-wrap gap-2 small"
                            >
                              <div style={{ minWidth: 0, maxWidth: '100%' }}>
                                <div className="fw-medium text-white">
                                  <ContentText
                                    text={alloc.itemName}
                                    locale={locale}
                                  />
                                </div>
                                <div
                                  className="text-truncate"
                                  style={{
                                    color: 'var(--rate-fg-secondary)',
                                    maxWidth: 'min(340px, 100%)',
                                  }}
                                >
                                  <ContentText
                                    text={alloc.offerTitle}
                                    locale={locale}
                                  />
                                </div>
                              </div>
                              <div className="d-flex align-items-center gap-2 rate-tabular flex-shrink-0">
                                <span className="fw-semibold text-white">
                                  {formatPriceVnd(alloc.priceVnd, locale)}
                                </span>
                                {safeHref && (
                                  <a
                                    href={safeHref}
                                    target="_blank"
                                    rel="noopener noreferrer nofollow"
                                    className="btn btn-sm btn-outline-light rounded-pill px-2 py-1"
                                  >
                                    {t('comboBuyAtStoreLink')}
                                  </a>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <section
      aria-labelledby={`${sectionId}-title`}
      aria-busy={loading}
      data-testid="watchlist-combo-optimizer"
      className="rate-scoreboard-dark rate-surface-dark p-md-4 mb-4 p-3"
    >
      <Suspense fallback={null}>
        <ComboParamsFromUrl
          lastSyncedApiUrlRef={lastSyncedApiUrlRef}
          onUrlState={applyUrlState}
        />
      </Suspense>
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center mb-3 gap-3">
        <div>
          <span className="rate-eyebrow mb-2">{t('comboEyebrow')}</span>
          <h2 id={`${sectionId}-title`} className="h4 fw-bold mb-1 text-white">
            {t('comboTitle')}
          </h2>
          <p
            className="small mb-0"
            style={{ color: 'var(--rate-fg-secondary)' }}
          >
            {t('comboSubtitle')}
          </p>
        </div>

        <div className="d-flex flex-wrap gap-2">
          {selectedSlugs.length > 0 && (
            <button
              type="button"
              onClick={handleClearSelection}
              className="btn btn-sm btn-outline-light rounded-pill px-3"
              data-testid="combo-clear-btn"
            >
              {t('comboClearBtn')}
            </button>
          )}
          <button
            type="button"
            disabled={!ogExport.canExport}
            onClick={handleDownloadComboPng}
            title={t('comboExportOgPngTitle')}
            aria-describedby={
              showOgGatingHint ? `${sectionId}-og-gating-hint` : undefined
            }
            data-testid="combo-export-og-png-btn"
            className="btn btn-sm btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center gap-1 px-3"
          >
            <BsDownload aria-hidden="true" />
            {t('comboExportOgPngBtn')}
          </button>
          <button
            type="button"
            disabled={selectedSlugs.length < COMBO_CART_MIN_ITEMS}
            onClick={() => void handleCopyShareLink()}
            data-testid="combo-copy-share-btn"
            className="btn btn-sm btn-danger rounded-pill fw-semibold d-inline-flex align-items-center gap-1 px-3"
          >
            <BsLink45Deg aria-hidden="true" />
            {copiedShareLink
              ? t('comboCopiedShareBtn')
              : t('comboCopyShareBtn')}
          </button>
        </div>
      </div>

      {/* Product Selector Chips & Custom Slug Input */}
      <div
        className="rounded-3 mb-3 p-3"
        style={{
          backgroundColor: 'var(--rate-glass-bg)',
          border: '1px solid var(--rate-glass-border)',
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
          <span className="small fw-semibold text-white">
            {t('comboSelectedCountLabel', {
              count: selectedSlugs.length,
              min: COMBO_CART_MIN_ITEMS,
              max: COMBO_CART_MAX_ITEMS,
            })}
          </span>
          {selectedSlugs.length < COMBO_CART_MIN_ITEMS && (
            <span
              className="small"
              style={{ color: 'var(--rate-ink-warning)' }}
            >
              {t('comboPickAtLeastTwo')}
            </span>
          )}
        </div>

        {selectedSlugs.length > 0 && (
          <div
            className="d-flex flex-wrap gap-2 mb-3"
            data-testid="combo-selected-chips"
          >
            {selectedSlugs.map((slug) => {
              const displayName =
                productNameBySlug.get(slug.toLowerCase()) ?? slug;
              return (
                <span
                  key={slug}
                  className="badge rounded-pill d-inline-flex align-items-center gap-1 px-3 py-1"
                  style={{
                    backgroundColor: 'var(--rate-brand-bg)',
                    color: 'var(--rate-fg-primary)',
                    border: '1px solid var(--rate-crimson-text)',
                  }}
                >
                  <span>{displayName}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleSlug(slug)}
                    aria-label={`${t('comboRemoveChipAria')}: ${displayName}`}
                    className="border-0 bg-transparent p-0 d-inline-flex align-items-center justify-content-center rounded-circle"
                    style={{
                      width: '24px',
                      height: '24px',
                      minWidth: '24px',
                      minHeight: '24px',
                      color: 'var(--rate-fg-primary)',
                      cursor: 'pointer',
                    }}
                  >
                    <BsX aria-hidden="true" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <form
          onSubmit={handleAddCustomSlug}
          className="row g-2 align-items-end mb-3"
        >
          <div className="col-md-8 col-12">
            <label
              htmlFor={`${sectionId}-slug-input`}
              className="form-label small mb-1"
              style={{ color: 'var(--rate-fg-secondary)' }}
            >
              {t('comboInputLabel')}
            </label>
            <input
              id={`${sectionId}-slug-input`}
              list={`${sectionId}-catalog-datalist`}
              type="text"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setInputError(null);
              }}
              placeholder={t('comboInputPlaceholder')}
              className="form-control form-control-sm"
              style={{
                backgroundColor: 'var(--rate-bg-elevated)',
                color: 'var(--rate-fg-primary)',
                borderColor: 'var(--rate-border-strong)',
              }}
            />
            <datalist id={`${sectionId}-catalog-datalist`}>
              {catalogProducts.slice(0, 40).map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </datalist>
          </div>
          <div className="col-md-4 col-12 d-grid">
            <button
              type="submit"
              disabled={selectedSlugs.length >= COMBO_CART_MAX_ITEMS}
              className="btn btn-sm btn-outline-light rounded-pill fw-semibold d-inline-flex align-items-center justify-content-center gap-1"
            >
              <BsPlus aria-hidden="true" />
              {t('comboAddBtn')}
            </button>
          </div>
        </form>

        {inputError && (
          <div
            role="alert"
            className="small mb-2"
            style={{ color: 'var(--rate-ink-danger)' }}
          >
            <BsExclamationTriangle aria-hidden="true" className="me-1" />
            {inputError}
          </div>
        )}

        {quickPickCandidates.length > 0 && (
          <div>
            <div
              className="small mb-2"
              style={{ color: 'var(--rate-fg-secondary)' }}
            >
              {t('comboQuickPickLabel')}
            </div>
            <div
              className="d-flex flex-wrap gap-2"
              role="group"
              aria-label={t('comboQuickPickLabel')}
            >
              {quickPickCandidates.map((cand) => {
                const isSelected = selectedLowerSet.has(
                  cand.slug.toLowerCase()
                );
                const disabled =
                  !isSelected && selectedSlugs.length >= COMBO_CART_MAX_ITEMS;
                return (
                  <button
                    key={cand.slug}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={disabled}
                    onClick={() => handleToggleSlug(cand.slug)}
                    className={`btn btn-sm rounded-pill px-3 ${
                      isSelected
                        ? 'btn-danger fw-semibold'
                        : 'btn-outline-light'
                    }`}
                  >
                    {cand.name}
                    {cand.minPrice > 0 &&
                      ` (${formatPriceVnd(cand.minPrice, locale)})`}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Optimizer Controls */}
      <div className="row g-3 align-items-end mb-3">
        <div className="col-lg-3 col-sm-6 col-12">
          <div className="form-check">
            <input
              id={`${sectionId}-official-only`}
              type="checkbox"
              checked={officialOnly}
              onChange={(e) =>
                applyComboUpdate({ officialOnly: e.target.checked })
              }
              className="form-check-input"
            />
            <label
              htmlFor={`${sectionId}-official-only`}
              className="form-check-label small fw-medium text-white"
            >
              {t('comboOfficialOnlyLabel')}
            </label>
          </div>
        </div>

        <div className="col-lg-3 col-sm-6 col-12">
          <label
            htmlFor={`${sectionId}-min-trust`}
            className="form-label small d-flex justify-content-between mb-1"
            style={{ color: 'var(--rate-fg-secondary)' }}
          >
            <span>{t('comboMinTrustLabel')}</span>
            <strong className="text-white rate-tabular">
              {formatNumber(minTrust, locale)}/100
            </strong>
          </label>
          <input
            id={`${sectionId}-min-trust`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={minTrust}
            onChange={(e) =>
              applyComboUpdate({ minTrust: clampComboMinTrust(e.target.value) })
            }
            className="form-range"
          />
        </div>

        <div className="col-lg-3 col-sm-6 col-12">
          <label
            htmlFor={`${sectionId}-max-stores`}
            className="form-label small mb-1"
            style={{ color: 'var(--rate-fg-secondary)' }}
          >
            {t('comboMaxStoresLabel')}
          </label>
          <select
            id={`${sectionId}-max-stores`}
            value={maxStores}
            onChange={(e) =>
              applyComboUpdate({
                maxStores: clampComboMaxStores(e.target.value),
              })
            }
            className="form-select form-select-sm"
            style={{
              backgroundColor: 'var(--rate-bg-elevated)',
              color: 'var(--rate-fg-primary)',
              borderColor: 'var(--rate-border-strong)',
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t('comboStoresCount', { count: n })}
              </option>
            ))}
          </select>
        </div>

        <div className="col-lg-3 col-sm-6 col-12">
          <label
            htmlFor={`${sectionId}-shipping-vnd`}
            className="form-label small mb-1"
            style={{ color: 'var(--rate-fg-secondary)' }}
          >
            {t('comboShippingPerStoreLabel')}
          </label>
          <input
            id={`${sectionId}-shipping-vnd`}
            list={`${sectionId}-shipping-presets`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={7}
            value={shippingDraft}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              setShippingDraft(digits);
              applyComboUpdate({
                shippingVnd: clampComboShippingVnd(digits || '0'),
              });
            }}
            onBlur={() => setShippingDraft(String(shippingVnd))}
            className="form-control form-control-sm rate-tabular"
            style={{
              backgroundColor: 'var(--rate-bg-elevated)',
              color: 'var(--rate-fg-primary)',
              borderColor: 'var(--rate-border-strong)',
            }}
          />
          <datalist id={`${sectionId}-shipping-presets`}>
            {OG_COMBO_SHIPPING_PRESETS.map((preset) => (
              <option key={preset} value={String(preset)}>
                {formatPriceVnd(preset, locale)}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      {showOgGatingHint && (
        <div
          id={`${sectionId}-og-gating-hint`}
          role="status"
          data-testid="combo-og-gating-hint"
          className="rounded-3 small mb-3 d-flex flex-column gap-2 px-3 py-2"
          style={{
            backgroundColor: 'var(--rate-glass-bg)',
            border: '1px solid var(--rate-ink-warning)',
            color: 'var(--rate-ink-warning)',
          }}
        >
          {!ogExport.minTrustValid && (
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <span>{t('comboOgInvalidMinTrustHint', { minTrust })}</span>
              <button
                type="button"
                data-testid="combo-og-snap-mintrust-btn"
                onClick={() => applyComboUpdate({ minTrust: snappedMinTrust })}
                className="btn btn-sm btn-outline-light rounded-pill px-2 py-1"
              >
                {t('comboOgSnapMinTrustBtn', { target: snappedMinTrust })}
              </button>
            </div>
          )}
          {!ogExport.shippingPresetValid && (
            <div className="d-flex flex-column gap-1">
              <span>{t('comboOgInvalidShippingHint')}</span>
              <div className="d-flex flex-wrap gap-1">
                {OG_COMBO_SHIPPING_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    data-testid={`combo-og-shipping-preset-${preset}`}
                    onClick={() => {
                      setShippingDraft(String(preset));
                      applyComboUpdate({ shippingVnd: preset });
                    }}
                    className="btn btn-sm btn-outline-light rounded-pill rate-tabular px-2 py-1"
                  >
                    {preset === 0 ? '0' : `${preset / 1000}k`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results / Loading / Error / Empty States */}
      {selectedSlugs.length < COMBO_CART_MIN_ITEMS ? (
        <div
          className="rounded-3 small p-3 text-center"
          data-testid="combo-empty-state"
          style={{
            backgroundColor: 'var(--rate-glass-bg)',
            border: '1px solid var(--rate-glass-border)',
            color: 'var(--rate-fg-secondary)',
          }}
        >
          {t('comboEmptyPrompt', {
            min: COMBO_CART_MIN_ITEMS,
            max: COMBO_CART_MAX_ITEMS,
          })}
        </div>
      ) : loading && !result ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="combo-loading-state"
          className="rounded-3 small p-4 text-center"
          style={{
            backgroundColor: 'var(--rate-glass-bg)',
            border: '1px solid var(--rate-glass-border)',
            color: 'var(--rate-fg-primary)',
          }}
        >
          {t('comboLoading')}
        </div>
      ) : fetchError ? (
        <div
          role="alert"
          data-testid="combo-error-state"
          className="rounded-3 d-flex justify-content-between align-items-center flex-wrap gap-2 p-3"
          style={{
            backgroundColor: 'var(--rate-status-bad-bg)',
            border: '1px solid var(--rate-ink-danger)',
            color: 'var(--rate-status-bad-fg)',
          }}
        >
          <span className="small">
            <BsExclamationTriangle aria-hidden="true" className="me-1" />
            {fetchError}
          </span>
          <button
            type="button"
            onClick={handleRetry}
            className="btn btn-sm btn-outline-light rounded-pill px-3"
          >
            {t('comboRetryBtn')}
          </button>
        </div>
      ) : (
        result && (
          <div data-testid="combo-results">
            {loading && (
              <div
                role="status"
                aria-live="polite"
                data-testid="combo-loading-state"
                className="rounded-3 small mb-2 px-3 py-2"
                style={{
                  backgroundColor: 'var(--rate-glass-bg)',
                  border: '1px solid var(--rate-glass-border)',
                  color: 'var(--rate-fg-secondary)',
                }}
              >
                {t('comboLoading')}
              </div>
            )}
            {/* Retired Variant / Missing / Uncovered Diagnostics */}
            {(retiredItems.length > 0 || uncoveredDetails.length > 0) && (
              <div
                role="status"
                data-testid="combo-diagnostics-alert"
                className="rounded-3 mb-3 p-3"
                style={{
                  backgroundColor: 'var(--rate-status-warn-bg)',
                  border: '1px solid var(--rate-ink-warning)',
                  color: 'var(--rate-fg-primary)',
                }}
              >
                <div
                  className="small fw-semibold mb-2"
                  style={{ color: 'var(--rate-ink-warning)' }}
                >
                  <BsExclamationTriangle aria-hidden="true" className="me-1" />
                  {t('comboDiagnosticsTitle')}
                </div>
                <ul className="list-unstyled small mb-0 d-flex flex-column gap-1">
                  {uncoveredDetails.map((diag) => (
                    <li
                      key={diag.slug}
                      className="d-flex align-items-center flex-wrap gap-2"
                    >
                      <span>
                        {diag.retiredVariant
                          ? t('comboRetiredVariantDiag', { slug: diag.slug })
                          : diag.missing
                            ? t('comboMissingSlugDiag', { slug: diag.slug })
                            : t('comboUncoveredSlugDiag', { name: diag.name })}
                      </span>
                      {diag.productHref && (
                        <Link
                          href={diag.productHref}
                          className="small fw-semibold text-white text-decoration-underline"
                        >
                          {diag.retiredVariant
                            ? t('comboChooseLiveVariantLink')
                            : t('comboViewProductLink')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Savings Summary Strip / Search Limits Notice */}
            {(result.singleStoreBest ||
              result.multiStoreOptimal ||
              !result.diagnostics.searchComplete) && (
              <div
                className="rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 px-3 py-2"
                data-testid="combo-savings-summary"
                style={{
                  backgroundColor:
                    result.savingsVsSingleStoreVnd > 0
                      ? 'var(--rate-score-user-bg)'
                      : 'var(--rate-glass-bg)',
                  border:
                    result.savingsVsSingleStoreVnd > 0
                      ? '1px solid var(--rate-ink-success)'
                      : '1px solid var(--rate-glass-border)',
                }}
              >
                <div className="small fw-semibold text-white">
                  {result.savingsVsSingleStoreVnd > 0 ? (
                    <>
                      <BsCheckCircle
                        aria-hidden="true"
                        className="me-1"
                        style={{ color: 'var(--rate-ink-success)' }}
                      />
                      {t('comboSavingsDelta', {
                        amount: formatPriceVnd(
                          result.savingsVsSingleStoreVnd,
                          locale
                        ),
                        pct: formatPercent(
                          result.savingsVsSingleStorePct,
                          locale,
                          { digits: 1 }
                        ),
                      })}
                    </>
                  ) : result.singleStoreBest ? (
                    t('comboSingleStoreAlreadyBest')
                  ) : result.multiStoreOptimal ? (
                    t('comboMultiStoreOnlyAvailable')
                  ) : (
                    t('comboPlanBIncomplete')
                  )}
                </div>
                {shouldShowComboBoundedSearchNote(result) && (
                  <span
                    className="small"
                    style={{ color: 'var(--rate-fg-secondary)' }}
                  >
                    {t('comboBoundedSearchNote')}
                  </span>
                )}
              </div>
            )}

            {/* Plan A vs Plan B Side by Side */}
            <div className="row g-3">
              {renderPlanCard(result.singleStoreBest, 'single')}
              {renderPlanCard(result.multiStoreOptimal, 'multi')}
            </div>
          </div>
        )
      )}
    </section>
  );
}
