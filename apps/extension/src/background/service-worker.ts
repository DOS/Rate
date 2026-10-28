import { RATE_API_V1_ENDPOINTS } from '@repo/shared-data';
import type {
  ExtensionLookupData,
  ExtensionSettings,
  ExtractedPageProductSignal,
} from '../types.js';
import {
  detectEcommercePlatform,
  extractIdsFromUrl,
  sanitizeProductUrl,
} from '../extractors/ecommerce-detector.js';
import {
  buildCrowdIngestPayload,
  DEFAULT_API_BASE_URL,
  isPrivilegedExtensionSender,
  normalizeAllowedApiBaseUrl,
  sanitizeExtensionProductSignal,
  selectFreshestSessionSignal,
} from '../security-guards.js';
import { resolveActionBadge } from '../verdict-display.js';

const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  crowdContributeOptIn: false,
};

async function getSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get([
      'apiBaseUrl',
      'crowdContributeOptIn',
    ]);
    return {
      apiBaseUrl: normalizeAllowedApiBaseUrl(
        typeof stored.apiBaseUrl === 'string' ? stored.apiBaseUrl : null
      ),
      crowdContributeOptIn: Boolean(stored.crowdContributeOptIn ?? false),
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
  | { ok: false; status: number | null };

async function requestLookup(endpoint: string): Promise<LookupOutcome> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Rate-Extension-Version': '2.0.0',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, status: null };
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
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const settings = await getSettings();
  const params = new URLSearchParams();
  params.set('platform', signal.platform);
  params.set('url', signal.canonicalUrl);
  params.set('title', signal.title);
  params.set('mode', mode);
  if (signal.externalItemId) params.set('externalId', signal.externalItemId);
  if (signal.externalShopId) params.set('shopId', signal.externalShopId);
  if (signal.selectedVariant) {
    params.set('selectedVariant', signal.selectedVariant);
  }
  if (signal.price && signal.price > 0) {
    params.set('price', String(signal.price));
  }
  if (signal.originalPrice && signal.originalPrice > 0) {
    params.set('originalPrice', String(signal.originalPrice));
  }

  return requestLookup(
    `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP}?${params.toString()}`
  );
}

const SUPPORTED_CROWD_PLATFORMS = new Set([
  'shopee',
  'lazada',
  'tiki',
  'tiktok',
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
]);

// The latest product lookup per tab (DOS/Rate#1300).
let detectRequestCounter = 0;
const latestDetectByTab = new Map<number, number>();
async function maybeSendOptInCrowdSignal(
  rawSignal: ExtractedPageProductSignal
): Promise<void> {
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const settings = await getSettings();
  // Strict Privacy Gate: Only send crowd verification signal if user explicitly opted in
  // and platform is in the 10-platform capability matrix
  if (!settings.crowdContributeOptIn) return;
  if (!SUPPORTED_CROWD_PLATFORMS.has(signal.platform)) return;
  if (!signal.externalItemId || !signal.price || signal.price <= 0) return;

  try {
    await fetch(
      `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_INGEST}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rate-Extension-Version': '2.0.0',
        },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify(buildCrowdIngestPayload(signal)),
      }
    );
  } catch {
    // Non-blocking background quarantine submission
  }
}

async function updateActionBadge(
  tabId: number | undefined,
  lookup: ExtensionLookupData | null
): Promise<void> {
  if (!tabId) return;
  try {
    const badge = resolveActionBadge(lookup);
    await chrome.action.setBadgeText({ text: badge.text, tabId });
    if (badge.color) {
      await chrome.action.setBadgeBackgroundColor({
        color: badge.color,
        tabId,
      });
    }
  } catch {
    // Ignore badge errors if tab closed
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    const existing = await chrome.storage.local.get([
      'apiBaseUrl',
      'crowdContributeOptIn',
    ]);
    if (typeof existing.apiBaseUrl !== 'string') {
      await chrome.storage.local.set({
        apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
        crowdContributeOptIn: DEFAULT_SETTINGS.crowdContributeOptIn,
      });
    }
  } catch {
    // Ignore sidePanel or storage init errors during extension reload
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
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (tabId) {
      void chrome.sidePanel.open({ tabId });
    } else if (windowId) {
      void chrome.sidePanel.open({ windowId });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msgType === 'RATE_PRODUCT_DETECTED') {
    const requestId = ++detectRequestCounter;
    if (sender.tab?.id) latestDetectByTab.set(sender.tab.id, requestId);
    // Only the tab's latest lookup may set its badge, stored lookup or
    // panel: an earlier one can answer after a later one (DOS/Rate#1300).
    const isLatest = () =>
      !sender.tab?.id || latestDetectByTab.get(sender.tab.id) === requestId;
    (async () => {
      try {
        const signal = sanitizeExtensionProductSignal(
          message.signal as ExtractedPageProductSignal
        );
        const tabId = sender.tab?.id;
        const isBackgroundTab = Boolean(
          sender.tab && sender.tab.active === false
        );
        const cacheKey = tabId ? `tab_${tabId}` : 'tab_latest';
        const now = Date.now();

        // Store latest extracted signal in session storage (ephemeral SW safe).
        // Background tabs only write their own `tab_<id>` slot so they never hijack
        // `tab_latest` or trigger sidepanel reloads on the active tab (#531).
        const signalPayload: Record<string, unknown> = {
          [cacheKey]: { signal, updatedAt: now, source: 'page' },
        };
        if (!isBackgroundTab) {
          signalPayload.tab_latest = {
            signal,
            updatedAt: now,
            source: 'page',
          };
        }
        await chrome.storage.session.set(signalPayload);

        const outcome = await fetchExtensionLookup(signal, 'pill');
        // Fire-and-forget Opt-In Quarantine Crowd Signal if user enabled it.
        // Sent whenever the server answered, as before (#1175): a network
        // error threw before it then, so it still sends nothing (#1300).
        if (outcome.ok || outcome.status !== null) {
          void maybeSendOptInCrowdSignal(signal);
        }
        // A failed lookup clears the previous product's badge (#1300).
        const lookup = outcome.ok ? outcome.data : null;
        if (!isLatest()) {
          sendResponse({ ok: outcome.ok, data: lookup, stale: true });
          return;
        }
        await updateActionBadge(tabId, lookup);
        if (!outcome.ok) {
          // An open side panel reloads for this page instead of keeping the
          // previous product (it listens to this key).
          if (!isBackgroundTab) {
            await chrome.storage.session.set({ lookup_tab_latest: null });
          }
          sendResponse({
            ok: false,
            status: outcome.status,
            error: 'Lookup failed',
          });
          return;
        }

        if (lookup) {
          const lookupPayload: Record<string, unknown> = {
            [`lookup_${cacheKey}`]: lookup,
          };
          if (!isBackgroundTab) {
            lookupPayload.lookup_tab_latest = lookup;
          }
          await chrome.storage.session.set(lookupPayload);
        }

        sendResponse({ ok: true, data: lookup });
      } catch (err) {
        if (isLatest()) await updateActionBadge(sender.tab?.id, null);
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
    (async () => {
      try {
        const cleanedVariant =
          typeof message.selectedVariant === 'string'
            ? message.selectedVariant
                .replace(/\p{Cc}+/gu, ' ')
                .trim()
                .slice(0, 200)
            : '';
        const overrideVariant = cleanedVariant || null;
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabKey = activeTab?.id ? `tab_${activeTab.id}` : 'tab_latest';
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

        const effectiveSignal: ExtractedPageProductSignal = overrideVariant
          ? { ...baseSignal, selectedVariant: overrideVariant }
          : baseSignal;

        if (overrideVariant) {
          const now = Date.now();
          const isQuickQuerySelected =
            Boolean(latestEntry?.signal) &&
            baseSignal === latestEntry?.signal &&
            latestEntry?.source === 'quick_query';
          if (isQuickQuerySelected) {
            await chrome.storage.session.set({
              tab_latest: {
                signal: effectiveSignal,
                updatedAt: now,
                source: 'quick_query',
              },
            });
          } else {
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
        }

        const outcome = await fetchExtensionLookup(effectiveSignal, 'full');
        sendResponse(
          outcome.ok
            ? {
                ok: true,
                settings,
                signal: effectiveSignal,
                data: outcome.data,
              }
            : {
                ok: false,
                status: outcome.status,
                settings,
                signal: effectiveSignal,
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
    (async () => {
      try {
        const rawQuery =
          typeof message.query === 'string'
            ? message.query
                .replace(/\p{Cc}+/gu, ' ')
                .trim()
                .slice(0, 500)
            : '';
        const settings = await getSettings();
        if (!rawQuery) {
          sendResponse({
            ok: false,
            error: 'Vui lòng nhập tên sản phẩm hoặc dán link TMĐT.',
          });
          return;
        }

        const isUrl = /^https?:\/\//i.test(rawQuery);
        const canonicalUrl = isUrl ? sanitizeProductUrl(rawQuery) || '' : '';
        const detectedPlatform =
          isUrl && canonicalUrl ? detectEcommercePlatform(canonicalUrl) : null;
        const extractedIds =
          isUrl && detectedPlatform && canonicalUrl
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
            settings,
            signal: syntheticSignal,
          });
          return;
        }
        const fullLookup = outcome.data;

        if (fullLookup?.platform) {
          syntheticSignal.platform = fullLookup.platform;
        }

        const now = Date.now();
        await chrome.storage.session.set({
          tab_latest: {
            signal: syntheticSignal,
            updatedAt: now,
            source: 'quick_query',
          },
        });

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
    if (!isPrivilegedExtensionSender(sender)) {
      sendResponse({
        ok: false,
        error: 'Settings can only be updated from the Rate extension sidepanel',
      });
      return false;
    }
    (async () => {
      try {
        const nextSettings: Partial<ExtensionSettings> = {};
        if (
          typeof message.apiBaseUrl === 'string' &&
          message.apiBaseUrl.trim()
        ) {
          nextSettings.apiBaseUrl = normalizeAllowedApiBaseUrl(
            message.apiBaseUrl
          );
        }
        if (typeof message.crowdContributeOptIn === 'boolean') {
          nextSettings.crowdContributeOptIn = message.crowdContributeOptIn;
        }
        await chrome.storage.local.set(nextSettings);
        const updated = await getSettings();
        sendResponse({ ok: true, settings: updated });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Settings update failed',
        });
      }
    })();
    return true;
  }

  return false;
});
