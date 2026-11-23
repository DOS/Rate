import { RATE_API_V1_ENDPOINTS } from '@repo/shared-data';
import { EXTENSION_MARKETPLACES } from '@repo/shared-data/rules';
import type {
  ExtensionLookupData,
  ExtensionSettings,
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from '../types.js';
import {
  detectEcommercePlatform,
  extractIdsFromUrl,
  sanitizeProductUrl,
} from '../extractors/ecommerce-detector.js';
import {
  buildCartItemLookupSignal,
  buildCartLookupCacheKey,
  CheckoutLookupCoordinator,
  detectCheckoutPlatform,
  evaluateCheckoutItemTrap,
  sanitizeCartLineItems,
} from '../extractors/checkout-detector.js';
import {
  buildExtensionObservationV1,
  buildLookupParams,
  DEFAULT_API_BASE_URL,
  isOnboardingSender,
  isPrivilegedExtensionSender,
  normalizeAllowedApiBaseUrl,
  ONBOARDING_PAGE_PATH,
  sanitizeExtensionProductSignal,
  selectFreshestSessionSignal,
  sliceCodePoints,
  stripLoneSurrogates,
} from '../security-guards.js';
import { LookupCooldown } from '../rate-limit.js';
import {
  ObservationClient,
  PENDING_ERASURE_KEY,
} from './observation-client.js';
import { t } from '../i18n.js';
import { resolveActionBadge } from '../verdict-display.js';

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  crowdContributeOptIn: false,
  checkoutGuardEnabled: true,
};

/**
 * The consent the opt-in was given under. Version 2 is ExtensionObservation
 * v1 with its submitter id (DOS/Rate#1606); an opt-in given to the older
 * crowd signal counts as off until the user says yes again.
 */
const OPT_IN_CONSENT_VERSION = 2;
let lastSeenPendingErasure = false;

async function getSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get([
      'apiBaseUrl',
      'crowdContributeOptIn',
      'crowdConsentVersion',
      'checkoutGuardEnabled',
      PENDING_ERASURE_KEY,
    ]);
    lastSeenPendingErasure =
      Array.isArray(stored[PENDING_ERASURE_KEY]) &&
      stored[PENDING_ERASURE_KEY].length > 0;
    return {
      apiBaseUrl: normalizeAllowedApiBaseUrl(
        typeof stored.apiBaseUrl === 'string' ? stored.apiBaseUrl : null
      ),
      crowdContributeOptIn:
        stored.crowdContributeOptIn === true &&
        stored.crowdConsentVersion === OPT_IN_CONSENT_VERSION,
      checkoutGuardEnabled: stored.checkoutGuardEnabled !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * A lookup either answers (data may be null: nothing matched) or fails with
 * the HTTP status, `null` for a network error or timeout, so the panel can
 * say which (DOS/Rate#1300).
 */
type LookupOutcome =
  | { ok: true; data: ExtensionLookupData | null }
  | {
      ok: false;
      status: number | null;
      /** Seconds until lookups resume after a 429 (DOS/Rate#1466). */
      retryAfterSeconds?: number;
    };

// The version the API sees, from the manifest, so a release bump reaches the header
// (DOS/Rate#1466).
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

// After a 429 no lookup is sent until the server's Retry-After has passed: kept in memory
// and in session storage, so a restarted worker keeps waiting (DOS/Rate#1466).
const RATE_LIMIT_KEY = 'lookup_rate_limited_until';
const lookupCooldown = new LookupCooldown({
  get: async () =>
    (await chrome.storage.session.get(RATE_LIMIT_KEY))?.[RATE_LIMIT_KEY],
  set: async (untilMs) => {
    await chrome.storage.session.set({ [RATE_LIMIT_KEY]: untilMs });
  },
});

async function requestLookup(endpoint: string): Promise<LookupOutcome> {
  const waitSeconds = await lookupCooldown.secondsLeft();
  if (waitSeconds > 0) {
    return { ok: false, status: 429, retryAfterSeconds: waitSeconds };
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Rate-Extension-Version': EXTENSION_VERSION,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: null };
  }
  if (response.status === 429) {
    return {
      ok: false,
      status: 429,
      retryAfterSeconds: await lookupCooldown.hold(
        response.headers.get('Retry-After')
      ),
    };
  }
  if (!response.ok) return { ok: false, status: response.status };
  try {
    const json = (await response.json()) as {
      ok?: boolean;
      data?: ExtensionLookupData;
    };
    if (json.ok === false) return { ok: false, status: response.status };
    return { ok: true, data: json.data ?? null };
  } catch {
    return { ok: false, status: response.status };
  }
}

async function fetchExtensionLookup(
  rawSignal: ExtractedPageProductSignal,
  mode: 'pill' | 'full'
): Promise<LookupOutcome> {
  const settings = await getSettings();
  const params = buildLookupParams(rawSignal, mode);

  return requestLookup(
    `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP}?${params.toString()}`
  );
}

// Opt-in ExtensionObservation v1 quarantine accepts all 22 SQL-checked
// marketplaces (`EXTENSION_MARKETPLACES`) aligned with `DOS-Me` migration
// `20261201130000` (`DOS/Rate#1762`, `DOS/Rate#1850`).
const SUPPORTED_CROWD_PLATFORMS: ReadonlySet<string> = new Set<string>(
  EXTENSION_MARKETPLACES
);

const QUICK_QUERY_BARE_MARKETPLACE_DOMAINS = [
  'shopee.vn',
  'lazada.vn',
  'tiki.vn',
  'tiktok.com',
  'cellphones.com.vn',
  'thegioididong.com',
  'topzone.vn',
  'dienmayxanh.com',
  'fptshop.com.vn',
  'hoanghamobile.com',
  'didongviet.vn',
  'phongvu.vn',
  'gearvn.com',
  'nguyenkim.com',
  'shopdunk.com',
  'hacom.vn',
  'clickbuy.com.vn',
  'viettelstore.vn',
  'pico.vn',
  'mediamart.vn',
  'memoryzone.com.vn',
  'anphatpc.com.vn',
] as const;

function normalizeQuickQueryBareMarketplaceUrl(
  rawQuery: string
): string | null {
  const hostAndPath =
    rawQuery.startsWith('//') && !rawQuery.startsWith('///')
      ? rawQuery.slice(2)
      : rawQuery;
  if (
    !hostAndPath ||
    /\s/.test(hostAndPath) ||
    hostAndPath.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(hostAndPath)
  ) {
    return null;
  }
  const rawHost = hostAndPath
    .split(/[/?#]/, 1)[0]
    ?.replace(/:\d+$/, '')
    .toLowerCase();
  if (
    !rawHost ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(rawHost) ||
    !QUICK_QUERY_BARE_MARKETPLACE_DOMAINS.some(
      (domain) => rawHost === domain || rawHost.endsWith(`.${domain}`)
    )
  ) {
    return null;
  }
  return sanitizeProductUrl(`https://${hostAndPath}`);
}

// The latest product lookup per tab (DOS/Rate#1300, #1664, #1809).
let detectRequestCounter = 0;
const latestDetectByTab = new Map<number, number>();
let fullLookupRequestCounter = 0;
const latestFullLookupByTab = new Map<number, number>();
let latestSelectionCounter = 0;
let latestPageSelectionCounter = 0;
let settingsUpdateChain: Promise<void> = Promise.resolve();
let checkoutRequestCounter = 0;
const latestCheckoutByTab = new Map<number, number>();
const checkoutLookupCoordinator = new CheckoutLookupCoordinator({
  ttlMs: 5 * 60_000,
  maxEntries: 100,
  maxConcurrency: 3,
});
let pendingQuickQueryReceipt: {
  updatedAt: number;
  apiBaseUrl: string;
  data: ExtensionLookupData | null;
} | null = null;

interface VerifiedMarketplaceUrl {
  marketplace: SupportedEcommercePlatform;
  origin: string;
}

/**
 * Exact store hosts permitted by `manifest.json` `host_permissions` across all
 * 22 supported Vietnamese stores. A leading `.` allows valid `[a-z0-9-]+`
 * subdomains as well as the bare base domain.
 */
const ALLOWED_EXTENSION_STORE_HOSTS: Readonly<
  Record<SupportedEcommercePlatform, readonly string[]>
> = {
  shopee: ['shopee.vn'],
  lazada: ['lazada.vn', '.lazada.vn'],
  tiki: ['tiki.vn'],
  tiktok: ['www.tiktok.com', 'shop.tiktok.com'],
  cellphones: ['cellphones.com.vn'],
  tgdd: ['thegioididong.com', '.thegioididong.com'],
  dienmayxanh: ['dienmayxanh.com', '.dienmayxanh.com'],
  topzone: ['topzone.vn', '.topzone.vn'],
  fptshop: ['fptshop.com.vn'],
  hoangha: ['hoanghamobile.com'],
  didongviet: ['didongviet.vn'],
  phongvu: ['phongvu.vn'],
  gearvn: ['gearvn.com', '.gearvn.com'],
  nguyenkim: ['nguyenkim.com', '.nguyenkim.com'],
  shopdunk: ['shopdunk.com', '.shopdunk.com'],
  hacom: ['hacom.vn', '.hacom.vn'],
  clickbuy: ['clickbuy.com.vn', '.clickbuy.com.vn'],
  viettelstore: ['viettelstore.vn', '.viettelstore.vn'],
  pico: ['pico.vn', '.pico.vn'],
  mediamart: ['mediamart.vn', '.mediamart.vn'],
  memoryzone: ['memoryzone.com.vn', '.memoryzone.com.vn'],
  anphatpc: ['anphatpc.com.vn', '.anphatpc.com.vn'],
};

function isAllowedExtensionStoreHost(
  platform: SupportedEcommercePlatform,
  host: string
): boolean {
  const h = host.toLowerCase();
  return ALLOWED_EXTENSION_STORE_HOSTS[platform].some((allowed) => {
    if (!allowed.startsWith('.')) return h === allowed;
    if (h === allowed.slice(1)) return true;
    if (!h.endsWith(allowed)) return false;
    return /^(?:[a-z0-9-]+\.)+$/.test(
      h.slice(0, h.length - allowed.length + 1)
    );
  });
}

function resolvePositiveIntId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function resolveMarketplaceFromHttpsUrl(
  rawUrl: unknown
): VerifiedMarketplaceUrl | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 8192 || /[\s\p{Cc}]/u.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port !== ''
    ) {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..')
    ) {
      return null;
    }
    for (const marketplace of Object.keys(
      ALLOWED_EXTENSION_STORE_HOSTS
    ) as SupportedEcommercePlatform[]) {
      if (isAllowedExtensionStoreHost(marketplace, host)) {
        return { marketplace, origin: parsed.origin.toLowerCase() };
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface ContentScriptMessageSender {
  id?: string;
  frameId?: number;
  documentLifecycle?: string;
  origin?: string;
  tab?: unknown;
  url?: string;
}

function validateContentScriptSender(
  sender: ContentScriptMessageSender | null | undefined,
  options?: { requireSignal?: boolean; rawSignal?: unknown }
): { ok: true } | { ok: false; error: string } {
  if (!sender || typeof sender !== 'object' || Array.isArray(sender)) {
    return { ok: false, error: 'Invalid message sender' };
  }
  const runtimeId =
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime?.id === 'string' &&
    chrome.runtime.id.length > 0
      ? chrome.runtime.id
      : undefined;
  if (
    runtimeId &&
    typeof sender.id === 'string' &&
    sender.id.length > 0 &&
    sender.id !== runtimeId
  ) {
    return { ok: false, error: 'Untrusted extension sender' };
  }
  if (typeof sender.frameId === 'number' && sender.frameId !== 0) {
    return {
      ok: false,
      error: 'Subframe content-script messages are not allowed',
    };
  }
  if (
    typeof sender.documentLifecycle === 'string' &&
    sender.documentLifecycle !== 'active'
  ) {
    return {
      ok: false,
      error: 'Inactive document lifecycle messages are not allowed',
    };
  }
  if (
    !sender.tab ||
    typeof sender.tab !== 'object' ||
    Array.isArray(sender.tab)
  ) {
    return {
      ok: false,
      error: 'Content-script messages must originate from a browser tab',
    };
  }
  const senderTab = sender.tab as {
    id?: unknown;
    windowId?: unknown;
    url?: unknown;
  };
  if (
    resolvePositiveIntId(senderTab.id) === undefined &&
    resolvePositiveIntId(senderTab.windowId) === undefined
  ) {
    return {
      ok: false,
      error: 'Content-script sender tab lacks a valid positive identifier',
    };
  }
  let senderIdentity: VerifiedMarketplaceUrl | null = null;
  if (sender.url !== undefined && sender.url !== null) {
    senderIdentity = resolveMarketplaceFromHttpsUrl(sender.url);
    if (!senderIdentity) {
      return {
        ok: false,
        error: 'Sender URL is not an allowed marketplace origin',
      };
    }
  }
  if (sender.origin !== undefined && sender.origin !== null) {
    const originIdentity = resolveMarketplaceFromHttpsUrl(sender.origin);
    if (
      !originIdentity ||
      (senderIdentity !== null &&
        (originIdentity.marketplace !== senderIdentity.marketplace ||
          originIdentity.origin !== senderIdentity.origin))
    ) {
      return {
        ok: false,
        error: 'Sender origin is not an allowed marketplace origin',
      };
    }
    senderIdentity ??= originIdentity;
  }
  if (
    senderIdentity === null &&
    senderTab.url !== undefined &&
    senderTab.url !== null
  ) {
    senderIdentity = resolveMarketplaceFromHttpsUrl(senderTab.url);
    if (!senderIdentity) {
      return {
        ok: false,
        error: 'Sender tab URL is not an allowed marketplace origin',
      };
    }
  }
  if (options?.requireSignal) {
    const rawSignal = options.rawSignal;
    if (
      !rawSignal ||
      typeof rawSignal !== 'object' ||
      Array.isArray(rawSignal)
    ) {
      return { ok: false, error: 'Invalid product signal' };
    }
    const candidate = rawSignal as {
      platform?: unknown;
      canonicalUrl?: unknown;
    };
    const declaredPlatform =
      typeof candidate.platform === 'string'
        ? candidate.platform.trim().toLowerCase()
        : '';
    const canonicalIdentity = resolveMarketplaceFromHttpsUrl(
      candidate.canonicalUrl
    );
    if (
      !canonicalIdentity ||
      declaredPlatform !== canonicalIdentity.marketplace
    ) {
      return {
        ok: false,
        error:
          'Signal platform and canonicalUrl must match an allowed marketplace',
      };
    }
    if (
      senderIdentity !== null &&
      (declaredPlatform !== senderIdentity.marketplace ||
        canonicalIdentity.origin !== senderIdentity.origin)
    ) {
      return {
        ok: false,
        error: 'Sender URL origin or platform does not match product signal',
      };
    }
  }
  return { ok: true };
}
async function maybeSendOptInCrowdSignal(
  rawSignal: ExtractedPageProductSignal
): Promise<void> {
  // Nothing is sent while lookups are rate-limited, even after a lookup that left before
  // the 429 (DOS/Rate#1466).
  if ((await lookupCooldown.secondsLeft()) > 0) return;
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const settings = await getSettings();
  // Strict Privacy Gate: Only send crowd verification observation if user
  // explicitly opted in and platform is in the 22 SQL-checked marketplaces.
  if (!settings.crowdContributeOptIn) {
    if (lastSeenPendingErasure) {
      await observationClient.retryErasures();
    }
    return;
  }
  if (!SUPPORTED_CROWD_PLATFORMS.has(signal.platform)) return;
  if (!signal.externalItemId || !signal.price || signal.price <= 0) return;
  // A 429 may have come back while the settings were read.
  if ((await lookupCooldown.secondsLeft()) > 0) return;

  // ExtensionObservation v1 into the quarantine (DOS/Rate#1606): only the
  // fields v1 names, under this install's random submitter id.
  const observation = buildExtensionObservationV1(
    signal,
    new Date(),
    EXTENSION_VERSION
  );
  if (!observation) return;
  await observationClient.send(settings.apiBaseUrl, observation);
}

const observationClient = new ObservationClient({
  storage: {
    get: (key) => chrome.storage.local.get(key),
    set: (items) => chrome.storage.local.set(items),
    remove: (key) => chrome.storage.local.remove(key),
  },
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  extensionVersion: EXTENSION_VERSION,
  optedIn: async () => (await getSettings()).crowdContributeOptIn,
  submitterPath: RATE_API_V1_ENDPOINTS.EXTENSION_SUBMITTER,
  observationPath: RATE_API_V1_ENDPOINTS.EXTENSION_OBSERVATION,
});

let badgeWriteCounter = 0;
const latestBadgeWriteByTab = new Map<number, number>();
async function updateActionBadge(
  tabId: number | undefined,
  lookup: ExtensionLookupData | null,
  isStillCurrent: () => boolean = () => true
): Promise<void> {
  if (!tabId || !isStillCurrent()) return;
  const writeSeq = ++badgeWriteCounter;
  latestBadgeWriteByTab.set(tabId, writeSeq);
  const canContinue = () =>
    isStillCurrent() && latestBadgeWriteByTab.get(tabId) === writeSeq;
  try {
    const badge = resolveActionBadge(lookup);
    await chrome.action.setBadgeText({ text: badge.text, tabId });
    if (badge.color && canContinue()) {
      await chrome.action.setBadgeBackgroundColor({
        color: badge.color,
        tabId,
      });
    }
  } catch {
    // Ignore badge errors if tab closed
  }
}

chrome.runtime.onStartup?.addListener(() => {
  void observationClient.retryErasures();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  void observationClient.retryErasures();
  // An opt-in given to the older crowd signal is not consent to v1: it is
  // off, and the consent page asks again (DOS/Rate#1606).
  if (details?.reason === 'update') {
    try {
      const stored = await chrome.storage.local.get([
        'crowdContributeOptIn',
        'crowdConsentVersion',
      ]);
      if (
        stored.crowdContributeOptIn === true &&
        stored.crowdConsentVersion !== OPT_IN_CONSENT_VERSION
      ) {
        await chrome.storage.local.set({ crowdContributeOptIn: false });
        await chrome.tabs.create({
          url: chrome.runtime.getURL(ONBOARDING_PAGE_PATH),
        });
      }
    } catch {
      // The side panel toggle still offers the choice.
    }
  }
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    // Each missing setting gets its default; a stored choice is kept.
    const existing = await chrome.storage.local.get([
      'apiBaseUrl',
      'crowdContributeOptIn',
      'checkoutGuardEnabled',
    ]);
    const defaults: Partial<ExtensionSettings> = {};
    if (typeof existing.apiBaseUrl !== 'string') {
      defaults.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
    }
    if (typeof existing.crowdContributeOptIn !== 'boolean') {
      defaults.crowdContributeOptIn = DEFAULT_SETTINGS.crowdContributeOptIn;
    }
    if (typeof existing.checkoutGuardEnabled !== 'boolean') {
      defaults.checkoutGuardEnabled = DEFAULT_SETTINGS.checkoutGuardEnabled;
    }
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
    }
  } catch {
    // Ignore sidePanel or storage init errors during extension reload
  }
  // On a first install only, after the defaults, ask about the opt-in
  // (DOS/Rate#1603). The default stays off, so closing the page sends
  // nothing extra.
  if (details?.reason === 'install') {
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL(ONBOARDING_PAGE_PATH),
      });
    } catch {
      // The side panel toggle still offers the choice.
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const msgType = (message as { type?: unknown }).type;

  // CRITICAL MV3 Rule: Call chrome.sidePanel.open synchronously in the first turn
  // before any await so the user gesture from clicking the Shadow DOM Pill is preserved!
  if (msgType === 'RATE_OPEN_SIDE_PANEL') {
    const senderCheck = validateContentScriptSender(sender);
    if (!senderCheck.ok) {
      sendResponse({ ok: false, error: senderCheck.error });
      return false;
    }
    const tabId = resolvePositiveIntId(sender.tab?.id);
    const windowId = resolvePositiveIntId(sender.tab?.windowId);
    try {
      if (tabId) {
        void Promise.resolve(chrome.sidePanel.open({ tabId })).catch(() => {
          // Ignore rejections when user gesture expired or tab closed
        });
      } else if (windowId) {
        void Promise.resolve(chrome.sidePanel.open({ windowId })).catch(() => {
          // Ignore rejections when user gesture expired or window closed
        });
      }
    } catch {
      // Ignore synchronous errors if sidePanel API is unavailable
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msgType === 'RATE_PRODUCT_CLEARED') {
    const senderCheck = validateContentScriptSender(sender);
    if (!senderCheck.ok) {
      sendResponse({ ok: false, error: senderCheck.error });
      return false;
    }
    const clearId = ++detectRequestCounter;
    const tabId = resolvePositiveIntId(sender.tab?.id);
    const isBackgroundTab = Boolean(sender.tab && sender.tab.active === false);
    const clearPageSeq = !isBackgroundTab ? ++latestPageSelectionCounter : null;
    const selectionAtClearEntry = latestSelectionCounter;
    if (tabId) latestDetectByTab.set(tabId, clearId);
    const isLatestClear = () =>
      tabId
        ? latestDetectByTab.get(tabId) === clearId
        : clearPageSeq !== null &&
          latestPageSelectionCounter === clearPageSeq &&
          latestSelectionCounter === selectionAtClearEntry;
    (async () => {
      try {
        await updateActionBadge(tabId, null, isLatestClear);
        if (!isLatestClear()) {
          sendResponse({ ok: true, stale: true });
          return;
        }
        const readKeys = tabId
          ? [`tab_${tabId}`, 'tab_latest', 'lookup_tab_latest']
          : ['tab_latest', 'lookup_tab_latest'];
        const sessionData = await chrome.storage.session.get(readKeys);
        if (!isLatestClear()) {
          sendResponse({ ok: true, stale: true });
          return;
        }
        const tabEntry = tabId
          ? (sessionData[`tab_${tabId}`] as
              | {
                  signal?: ExtractedPageProductSignal;
                  updatedAt?: number;
                  source?: 'page' | 'quick_query';
                }
              | undefined)
          : undefined;
        const latestEntry = sessionData.tab_latest as
          | {
              signal?: ExtractedPageProductSignal;
              updatedAt?: number;
              source?: 'page' | 'quick_query';
            }
          | undefined;
        const hasNewerQuickQuery =
          latestEntry?.source === 'quick_query' &&
          Boolean(latestEntry.signal) &&
          (typeof latestEntry.updatedAt !== 'number' ||
            typeof tabEntry?.updatedAt !== 'number' ||
            latestEntry.updatedAt >= tabEntry.updatedAt);
        const canClearLatestNow = () =>
          !hasNewerQuickQuery &&
          latestSelectionCounter === selectionAtClearEntry &&
          (clearPageSeq !== null
            ? latestPageSelectionCounter === clearPageSeq
            : Boolean(
                tabEntry?.signal &&
                latestEntry?.signal &&
                tabEntry.updatedAt !== undefined &&
                tabEntry.updatedAt === latestEntry.updatedAt &&
                tabEntry.signal.canonicalUrl === latestEntry.signal.canonicalUrl
              ));

        const ownsCurrentLatest = canClearLatestNow();
        if (ownsCurrentLatest) {
          pendingQuickQueryReceipt = null;
        }
        const sessionStorage = chrome.storage
          .session as typeof chrome.storage.session & {
          remove?: (keys: string | string[]) => Promise<void>;
        };
        if (typeof sessionStorage.remove === 'function') {
          if (
            ownsCurrentLatest &&
            sessionData.lookup_tab_latest === undefined
          ) {
            await sessionStorage.set({ lookup_tab_latest: null });
            if (!isLatestClear()) {
              sendResponse({ ok: true, stale: true });
              return;
            }
          }
          const finalKeysToClear: string[] = [];
          if (tabId) {
            finalKeysToClear.push(`tab_${tabId}`, `lookup_tab_${tabId}`);
          }
          if (canClearLatestNow()) {
            pendingQuickQueryReceipt = null;
            finalKeysToClear.push('tab_latest', 'lookup_tab_latest');
          }
          if (finalKeysToClear.length > 0) {
            await sessionStorage.remove(finalKeysToClear);
          }
        } else {
          if (ownsCurrentLatest && sessionData.lookup_tab_latest === null) {
            await sessionStorage.set({ lookup_tab_latest: false });
            if (!isLatestClear()) {
              sendResponse({ ok: true, stale: true });
              return;
            }
          }
          const keysToNull: string[] = [];
          if (tabId) {
            keysToNull.push(`tab_${tabId}`, `lookup_tab_${tabId}`);
          }
          if (canClearLatestNow()) {
            pendingQuickQueryReceipt = null;
            keysToNull.push('tab_latest', 'lookup_tab_latest');
          }
          if (keysToNull.length > 0) {
            await sessionStorage.set(
              Object.fromEntries(keysToNull.map((k) => [k, null]))
            );
          }
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({
          ok: false,
          error:
            err instanceof Error ? err.message : 'Product state clear failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_PRODUCT_DETECTED') {
    const senderCheck = validateContentScriptSender(sender, {
      requireSignal: true,
      rawSignal: (message as { signal?: unknown }).signal,
    });
    if (!senderCheck.ok) {
      sendResponse({ ok: false, error: senderCheck.error });
      return false;
    }
    const requestId = ++detectRequestCounter;
    const tabId = resolvePositiveIntId(sender.tab?.id);
    const isBackgroundTab = Boolean(sender.tab && sender.tab.active === false);
    const latestOwnerSeq = !isBackgroundTab ? ++latestSelectionCounter : null;
    const pageOwnerSeq = !isBackgroundTab ? ++latestPageSelectionCounter : null;
    if (tabId) latestDetectByTab.set(tabId, requestId);
    const ownsTabLatest = () =>
      latestOwnerSeq !== null &&
      latestSelectionCounter === latestOwnerSeq &&
      latestPageSelectionCounter === pageOwnerSeq;
    // Only the tab's latest lookup may set its badge, stored lookup or
    // panel: an earlier one can answer after a later one (DOS/Rate#1300).
    const isLatest = () =>
      tabId ? latestDetectByTab.get(tabId) === requestId : ownsTabLatest();
    (async () => {
      try {
        const signal = sanitizeExtensionProductSignal(
          message.signal as ExtractedPageProductSignal
        );
        const cacheKey = tabId ? `tab_${tabId}` : 'tab_latest';
        const now = Date.now();

        // Store latest extracted signal in session storage (ephemeral SW safe).
        // Background tabs only write their own `tab_<id>` slot so they never hijack
        // `tab_latest` or trigger sidepanel reloads on the active tab (#531).
        const signalPayload: Record<string, unknown> = {};
        if (tabId) {
          signalPayload[cacheKey] = { signal, updatedAt: now, source: 'page' };
        }
        if (ownsTabLatest()) {
          pendingQuickQueryReceipt = null;
          signalPayload.tab_latest = {
            signal,
            updatedAt: now,
            source: 'page',
          };
        }
        if (Object.keys(signalPayload).length > 0) {
          await chrome.storage.session.set(signalPayload);
        }

        const outcome = await fetchExtensionLookup(signal, 'pill');
        // Fire-and-forget Opt-In Quarantine Crowd Signal if user enabled it.
        // Sent whenever the server answered, as before (#1175): a network
        // error threw before it then, so it still sends nothing (#1300).
        // Never while lookups are rate-limited (DOS/Rate#1466).
        if (outcome.ok || (outcome.status !== null && outcome.status !== 429)) {
          void maybeSendOptInCrowdSignal(signal);
        }
        // A failed lookup clears the previous product's badge (#1300).
        const lookup = outcome.ok ? outcome.data : null;
        if (!isLatest()) {
          sendResponse({ ok: outcome.ok, data: lookup, stale: true });
          return;
        }
        await updateActionBadge(tabId, lookup, isLatest);
        if (!isLatest()) {
          sendResponse({ ok: outcome.ok, data: lookup, stale: true });
          return;
        }
        // Always persist or clear `lookup_tab_<id>` (and `lookup_tab_latest`
        // while this lookup still owns `tab_latest`) so stale product state
        // never lingers after a lookup error or null/unmatched response
        // without clobbering a newer quick-query selection (DOS/Rate#1664, #1734).
        const lookupPayload: Record<string, unknown> = {};
        if (tabId) {
          lookupPayload[`lookup_${cacheKey}`] = lookup;
        }
        if (ownsTabLatest()) {
          lookupPayload.lookup_tab_latest = lookup;
        }
        if (Object.keys(lookupPayload).length > 0) {
          await chrome.storage.session.set(lookupPayload);
        }
        if (!isLatest()) {
          sendResponse({ ok: outcome.ok, data: lookup, stale: true });
          return;
        }
        if (!outcome.ok) {
          sendResponse({
            ok: false,
            status: outcome.status,
            retryAfterSeconds: outcome.retryAfterSeconds,
            error: 'Lookup failed',
          });
          return;
        }

        sendResponse({ ok: true, data: lookup });
      } catch (err) {
        if (isLatest()) {
          await updateActionBadge(sender.tab?.id, null);
        }
        if (isLatest()) {
          const errPayload: Record<string, unknown> = {};
          if (tabId) {
            errPayload[`lookup_tab_${tabId}`] = null;
          }
          if (ownsTabLatest()) {
            errPayload.lookup_tab_latest = null;
          }
          if (Object.keys(errPayload).length > 0) {
            try {
              await chrome.storage.session.set(errPayload);
            } catch {
              // Ignore session storage errors during worker shutdown
            }
          }
        }
        sendResponse({
          ok: false,
          status: null,
          error: err instanceof Error ? err.message : 'Lookup failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_SIDEPANEL_FETCH_FULL') {
    if (!isPrivilegedExtensionSender(sender)) {
      sendResponse({
        ok: false,
        error:
          'Full lookup can only be requested from the Rate extension sidepanel',
      });
      return false;
    }
    const fullSeq = ++fullLookupRequestCounter;
    const detectSnapshotAtEntry = new Map(latestDetectByTab);
    const selectionAtEntry = latestSelectionCounter;
    const pageSelectionAtEntry = latestPageSelectionCounter;
    (async () => {
      try {
        const cleanedVariant =
          typeof message.selectedVariant === 'string'
            ? sliceCodePoints(
                stripLoneSurrogates(message.selectedVariant)
                  .replace(/\p{Cc}+/gu, ' ')
                  .trim(),
                200
              )
            : '';
        const overrideVariant = cleanedVariant || null;
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabKey = activeTab?.id ? `tab_${activeTab.id}` : 'tab_latest';
        const detectSeqAtEntry =
          activeTab?.id !== undefined
            ? detectSnapshotAtEntry.get(activeTab.id)
            : undefined;
        const sessionData = await chrome.storage.session.get([
          tabKey,
          'tab_latest',
        ]);
        const tabEntry = sessionData[tabKey] as
          | {
              signal?: ExtractedPageProductSignal;
              updatedAt?: number;
              source?: 'page' | 'quick_query';
            }
          | undefined;
        const latestEntry = sessionData.tab_latest as
          | {
              signal?: ExtractedPageProductSignal;
              updatedAt?: number;
              source?: 'page' | 'quick_query';
            }
          | undefined;
        const baseSignal = selectFreshestSessionSignal(tabEntry, latestEntry);

        const settings = await getSettings();

        if (!baseSignal) {
          sendResponse({
            ok: true,
            settings,
            signal: null,
            data: null,
          });
          return;
        }

        const isQuickQuerySelected =
          Boolean(latestEntry?.signal) &&
          baseSignal === latestEntry?.signal &&
          latestEntry?.source === 'quick_query';
        const isActiveTabPageSignal =
          Boolean(activeTab?.id && tabEntry?.signal) &&
          baseSignal === tabEntry?.signal &&
          tabEntry?.source !== 'quick_query' &&
          !isQuickQuerySelected;

        const trackedTabId = isActiveTabPageSignal ? activeTab?.id : undefined;
        if (
          trackedTabId !== undefined &&
          (latestFullLookupByTab.get(trackedTabId) ?? 0) < fullSeq
        ) {
          latestFullLookupByTab.set(trackedTabId, fullSeq);
        }
        const isCurrentTabLookup = () =>
          trackedTabId !== undefined &&
          latestDetectByTab.get(trackedTabId) === detectSeqAtEntry &&
          latestFullLookupByTab.get(trackedTabId) === fullSeq;
        const isCurrentFallbackLookup = () =>
          fullSeq === fullLookupRequestCounter &&
          latestSelectionCounter === selectionAtEntry &&
          (isQuickQuerySelected ||
            latestPageSelectionCounter === pageSelectionAtEntry);

        const effectiveSignal: ExtractedPageProductSignal = overrideVariant
          ? { ...baseSignal, selectedVariant: overrideVariant }
          : baseSignal;

        if (overrideVariant) {
          const now = Date.now();
          if (isActiveTabPageSignal) {
            if (isCurrentTabLookup()) {
              await chrome.storage.session.set({
                [tabKey]: {
                  signal: effectiveSignal,
                  updatedAt: now,
                  source: 'page',
                },
                tab_latest: {
                  signal: effectiveSignal,
                  updatedAt: now,
                  source: 'page',
                },
              });
            }
          } else if (isCurrentFallbackLookup()) {
            await chrome.storage.session.set({
              tab_latest: {
                signal: effectiveSignal,
                updatedAt: now,
                source: isQuickQuerySelected ? 'quick_query' : 'page',
              },
            });
          }
        }

        if (
          isQuickQuerySelected &&
          !overrideVariant &&
          pendingQuickQueryReceipt &&
          latestEntry?.updatedAt === pendingQuickQueryReceipt.updatedAt &&
          settings.apiBaseUrl === pendingQuickQueryReceipt.apiBaseUrl
        ) {
          if (!isCurrentFallbackLookup()) {
            sendResponse({
              ok: true,
              settings,
              signal: effectiveSignal,
              data: pendingQuickQueryReceipt.data,
              stale: true,
            });
            return;
          }
          const receipt = pendingQuickQueryReceipt;
          pendingQuickQueryReceipt = null;
          sendResponse({
            ok: true,
            settings,
            signal: effectiveSignal,
            data: receipt.data,
          });
          return;
        }

        const outcome = await fetchExtensionLookup(effectiveSignal, 'full');
        if (isCurrentTabLookup() && trackedTabId !== undefined) {
          const resolvedLookup = outcome.ok ? outcome.data : null;
          await updateActionBadge(
            trackedTabId,
            resolvedLookup,
            isCurrentTabLookup
          );
          if (isCurrentTabLookup()) {
            await chrome.storage.session.set({
              [`lookup_${tabKey}`]: resolvedLookup,
            });
          }
        }
        const stale = isActiveTabPageSignal
          ? !isCurrentTabLookup()
          : !isCurrentFallbackLookup();
        sendResponse(
          outcome.ok
            ? {
                ok: true,
                settings,
                signal: effectiveSignal,
                data: outcome.data,
                ...(stale ? { stale: true } : {}),
              }
            : {
                ok: false,
                status: outcome.status,
                retryAfterSeconds: outcome.retryAfterSeconds,
                settings,
                signal: effectiveSignal,
                ...(stale ? { stale: true } : {}),
              }
        );
      } catch (err) {
        sendResponse({
          ok: false,
          status: null,
          error: err instanceof Error ? err.message : 'Full lookup failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_SIDEPANEL_QUICK_QUERY') {
    if (!isPrivilegedExtensionSender(sender)) {
      sendResponse({
        ok: false,
        error:
          'Quick query can only be requested from the Rate extension sidepanel',
      });
      return false;
    }
    const quickSeq = ++fullLookupRequestCounter;
    const selectionAtQuickEntry = latestSelectionCounter;
    pendingQuickQueryReceipt = null;
    (async () => {
      try {
        const rawQuery =
          typeof message.query === 'string'
            ? sliceCodePoints(
                stripLoneSurrogates(message.query)
                  .replace(/\p{Cc}+/gu, ' ')
                  .trim(),
                500
              )
            : '';
        const settings = await getSettings();
        if (!rawQuery) {
          sendResponse({
            ok: false,
            error: t('quickQueryEmpty'),
          });
          return;
        }

        const hasHttpScheme = /^https?:\/\//i.test(rawQuery);
        const sanitizedCandidate = hasHttpScheme
          ? sanitizeProductUrl(rawQuery)
          : normalizeQuickQueryBareMarketplaceUrl(rawQuery);
        const detectedPlatform = sanitizedCandidate
          ? detectEcommercePlatform(sanitizedCandidate)
          : null;
        const canonicalUrl =
          sanitizedCandidate && (hasHttpScheme || detectedPlatform)
            ? sanitizedCandidate
            : '';
        const extractedIds =
          detectedPlatform && canonicalUrl
            ? extractIdsFromUrl(detectedPlatform, canonicalUrl)
            : { externalItemId: null, externalShopId: null };

        const syntheticSignal: ExtractedPageProductSignal = {
          platform: detectedPlatform || 'shopee',
          canonicalUrl,
          externalItemId: extractedIds.externalItemId,
          externalShopId: extractedIds.externalShopId,
          title: rawQuery,
          selectedVariant: null,
          price: null,
          originalPrice: null,
          ratingStar: null,
          ratingCount: null,
        };

        const params = new URLSearchParams();
        params.set('mode', 'full');
        if (detectedPlatform) {
          params.set('platform', detectedPlatform);
        }
        if (canonicalUrl) {
          params.set('url', canonicalUrl);
        }
        if (extractedIds.externalItemId) {
          params.set('externalId', extractedIds.externalItemId);
        }
        if (extractedIds.externalShopId) {
          params.set('shopId', extractedIds.externalShopId);
        }
        params.set('title', rawQuery);

        const outcome = await requestLookup(
          `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP}?${params.toString()}`
        );
        if (!outcome.ok) {
          // The panel tells a rate limit, a server error and a network
          // error apart (DOS/Rate#1300).
          sendResponse({
            ok: false,
            status: outcome.status,
            retryAfterSeconds: outcome.retryAfterSeconds,
            settings,
            signal: syntheticSignal,
          });
          return;
        }
        const fullLookup = outcome.data;

        if (fullLookup?.platform) {
          syntheticSignal.platform = fullLookup.platform;
        }

        if (
          quickSeq === fullLookupRequestCounter &&
          latestSelectionCounter === selectionAtQuickEntry
        ) {
          ++latestSelectionCounter;
          const now = Date.now();
          pendingQuickQueryReceipt = {
            updatedAt: now,
            apiBaseUrl: settings.apiBaseUrl,
            data: fullLookup,
          };
          await chrome.storage.session.set({
            tab_latest: {
              signal: syntheticSignal,
              updatedAt: now,
              source: 'quick_query',
            },
            lookup_tab_latest: fullLookup,
          });
        }

        sendResponse({
          ok: true,
          settings,
          signal: syntheticSignal,
          data: fullLookup,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          status: null,
          error:
            err instanceof Error ? err.message : 'Quick query lookup failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_UPDATE_SETTINGS') {
    // The install consent page may set the opt-in and nothing else.
    const fromOnboarding = isOnboardingSender(sender);
    if (!fromOnboarding && !isPrivilegedExtensionSender(sender)) {
      sendResponse({
        ok: false,
        error: 'Settings can only be updated from the Rate extension sidepanel',
      });
      return false;
    }
    const runSettingsUpdate = async (): Promise<void> => {
      try {
        const nextSettings: Partial<ExtensionSettings> = {};
        let serverChanged = false;
        if (
          !fromOnboarding &&
          typeof message.apiBaseUrl === 'string' &&
          message.apiBaseUrl.trim()
        ) {
          nextSettings.apiBaseUrl = normalizeAllowedApiBaseUrl(
            message.apiBaseUrl
          );
          // The cooldown was another server's (DOS/Rate#1466); saving the same one keeps it.
          if (nextSettings.apiBaseUrl !== (await getSettings()).apiBaseUrl) {
            await lookupCooldown.clear();
            checkoutLookupCoordinator.clear();
            serverChanged = true;
          }
        }
        if (
          !fromOnboarding &&
          typeof message.checkoutGuardEnabled === 'boolean'
        ) {
          nextSettings.checkoutGuardEnabled = message.checkoutGuardEnabled;
        }
        const consent: Record<string, unknown> = {};
        if (typeof message.crowdContributeOptIn === 'boolean') {
          nextSettings.crowdContributeOptIn = message.crowdContributeOptIn;
          consent.crowdConsentVersion = message.crowdContributeOptIn
            ? OPT_IN_CONSENT_VERSION
            : null;
        }
        await chrome.storage.local.set({ ...nextSettings, ...consent });
        // Turning it off erases this install's contributions (DOS/Rate#1606);
        // switching servers rotates and queues erasure of the previous server's
        // submitter id immediately even if that server is held (DOS/Rate#1682).
        if (nextSettings.crowdContributeOptIn === false) {
          void observationClient.forget();
        } else if (serverChanged && nextSettings.apiBaseUrl) {
          void observationClient.syncServer(nextSettings.apiBaseUrl);
        }
        const updated = await getSettings();
        sendResponse({ ok: true, settings: updated });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Settings update failed',
        });
      }
    };
    settingsUpdateChain = settingsUpdateChain.then(
      runSettingsUpdate,
      runSettingsUpdate
    );
    return true;
  }

  if (msgType === 'RATE_CHECKOUT_GUARD_LOOKUP') {
    const senderCheck = validateContentScriptSender(sender);
    if (!senderCheck.ok) {
      sendResponse({ ok: false, error: senderCheck.error });
      return false;
    }
    const rawPageUrl =
      typeof (message as { pageUrl?: unknown }).pageUrl === 'string'
        ? (message as { pageUrl: string }).pageUrl.trim()
        : '';
    const pagePlatform = detectCheckoutPlatform(rawPageUrl);
    if (!pagePlatform) {
      sendResponse({
        ok: false,
        error: 'Page URL is not an allowed cart or checkout route',
      });
      return false;
    }
    const senderUrlCandidate =
      typeof sender.url === 'string' && sender.url.trim()
        ? sender.url.trim()
        : typeof (sender.tab as { url?: unknown } | undefined)?.url ===
              'string' && String((sender.tab as { url: string }).url).trim()
          ? String((sender.tab as { url: string }).url).trim()
          : '';
    if (!senderUrlCandidate) {
      sendResponse({
        ok: false,
        error: 'Sender URL is required for checkout lookup',
      });
      return false;
    }
    const senderCheckoutPlatform = detectCheckoutPlatform(senderUrlCandidate);
    const pageIdentity = resolveMarketplaceFromHttpsUrl(rawPageUrl);
    const senderIdentity = resolveMarketplaceFromHttpsUrl(senderUrlCandidate);
    const rawSenderOrigin =
      typeof (sender as { origin?: unknown }).origin === 'string'
        ? (sender as { origin: string }).origin.trim()
        : '';
    const senderOriginIdentity = rawSenderOrigin
      ? resolveMarketplaceFromHttpsUrl(rawSenderOrigin)
      : null;
    if (
      !senderCheckoutPlatform ||
      senderCheckoutPlatform !== pagePlatform ||
      !pageIdentity ||
      !senderIdentity ||
      pageIdentity.origin !== senderIdentity.origin ||
      (rawSenderOrigin !== '' &&
        senderOriginIdentity?.origin !== pageIdentity.origin)
    ) {
      sendResponse({
        ok: false,
        error: 'Sender URL does not match declared checkout page',
      });
      return false;
    }

    const reqSeq = ++checkoutRequestCounter;
    const tabId = resolvePositiveIntId(sender.tab?.id);
    if (tabId) latestCheckoutByTab.set(tabId, reqSeq);
    const isLatestCheckout = () =>
      tabId ? latestCheckoutByTab.get(tabId) === reqSeq : true;

    (async () => {
      try {
        const settings = await getSettings();
        if (settings.checkoutGuardEnabled === false) {
          sendResponse({ ok: true, enabled: false, warnings: [] });
          return;
        }
        const initialWait = await lookupCooldown.secondsLeft();
        if (initialWait > 0) {
          sendResponse({
            ok: false,
            status: 429,
            retryAfterSeconds: initialWait,
            warnings: [],
          });
          return;
        }
        const items = sanitizeCartLineItems(
          (message as { items?: unknown }).items,
          rawPageUrl
        );
        if (items.length === 0) {
          sendResponse({ ok: true, enabled: true, warnings: [] });
          return;
        }

        // Read-only GET /api/v1/rate/extension/lookup only (TTL-cached, <= 3
        // concurrent requests). Cart items are NEVER sent to M2 observation ingest.
        let anyLookupFailed = false;
        const evaluated = await Promise.all(
          items.map(async (item) => {
            const cacheKey = buildCartLookupCacheKey(
              settings.apiBaseUrl,
              pagePlatform,
              item
            );
            const cartSignal = buildCartItemLookupSignal(pagePlatform, item);
            const res = await checkoutLookupCoordinator.lookupItem(
              cacheKey,
              async () => {
                if ((await lookupCooldown.secondsLeft()) > 0) {
                  return { ok: false, data: null };
                }
                const outcome = await fetchExtensionLookup(cartSignal, 'full');
                return outcome.ok
                  ? { ok: true, data: outcome.data }
                  : { ok: false, data: null };
              }
            );
            if (!res.ok) {
              anyLookupFailed = true;
              return null;
            }
            if (!res.data) return null;
            return evaluateCheckoutItemTrap(item, res.data, {
              currentPlatform: pagePlatform,
              apiBaseUrl: settings.apiBaseUrl,
            });
          })
        );

        if (!isLatestCheckout()) {
          sendResponse({ ok: true, stale: true, warnings: [] });
          return;
        }

        const warnings = evaluated
          .filter((w): w is NonNullable<typeof w> => w !== null)
          .sort(
            (a, b) => b.savingsVnd - a.savingsVnd || b.markupPct - a.markupPct
          );

        if (warnings.length === 0 && anyLookupFailed) {
          const cooldownWait = await lookupCooldown.secondsLeft();
          sendResponse({
            ok: false,
            status: cooldownWait > 0 ? 429 : 503,
            ...(cooldownWait > 0 ? { retryAfterSeconds: cooldownWait } : {}),
            warnings: [],
          });
          return;
        }

        sendResponse({
          ok: true,
          enabled: true,
          warnings,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          warnings: [],
          error:
            err instanceof Error ? err.message : 'Checkout guard lookup failed',
        });
      }
    })();
    return true;
  }

  return false;
});
