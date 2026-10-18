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
  DEFAULT_API_BASE_URL,
  isPrivilegedExtensionSender,
  normalizeAllowedApiBaseUrl,
  sanitizeExtensionProductSignal,
} from '../security-guards.js';

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

async function fetchExtensionLookup(
  rawSignal: ExtractedPageProductSignal,
  mode: 'pill' | 'full'
): Promise<ExtensionLookupData | null> {
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

  const endpoint = `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP}?${params.toString()}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Rate-Extension-Version': '2.0.0',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;
  const json = (await response.json()) as {
    ok?: boolean;
    data?: ExtensionLookupData;
  };
  return json.ok && json.data ? json.data : null;
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
        body: JSON.stringify({
          platform: signal.platform,
          externalItemId: signal.externalItemId,
          externalShopId: signal.externalShopId,
          url: signal.canonicalUrl,
          title: signal.title,
          selectedVariant: signal.selectedVariant,
          price: signal.price,
          originalPrice: signal.originalPrice,
          ratingStar: signal.ratingStar,
          ratingCount: signal.ratingCount,
          userConsentOptIn: true,
        }),
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
    if (!lookup || lookup.matchStatus === 'not_found') {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }
    const verdict = lookup.priceAssessment.verdict;
    if (verdict === 'inflated_fake_sale') {
      await chrome.action.setBadgeText({ text: 'ẢO!', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#d83030', tabId });
    } else if (verdict === 'genuine_deal') {
      await chrome.action.setBadgeText({ text: 'TỐT', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#2dba69', tabId });
    } else if (verdict === 'above_market') {
      await chrome.action.setBadgeText({ text: 'CAO', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b', tabId });
    } else {
      await chrome.action.setBadgeText({ text: 'OK', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId });
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
  const msgType = message.type;

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
    (async () => {
      try {
        const signal = sanitizeExtensionProductSignal(
          message.signal as ExtractedPageProductSignal
        );
        const tabId = sender.tab?.id;
        const cacheKey = tabId ? `tab_${tabId}` : 'tab_latest';

        // Store latest extracted signal in session storage (ephemeral SW safe)
        await chrome.storage.session.set({
          [cacheKey]: { signal, updatedAt: Date.now() },
          tab_latest: { signal, updatedAt: Date.now() },
        });

        const lookup = await fetchExtensionLookup(signal, 'pill');
        await updateActionBadge(tabId, lookup);

        if (lookup) {
          await chrome.storage.session.set({
            [`lookup_${cacheKey}`]: lookup,
            lookup_tab_latest: lookup,
          });
        }

        // Fire-and-forget Opt-In Quarantine Crowd Signal if user enabled it
        void maybeSendOptInCrowdSignal(signal);

        sendResponse({ ok: true, data: lookup });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Lookup failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_SIDEPANEL_FETCH_FULL') {
    (async () => {
      try {
        const overrideVariant =
          typeof message.selectedVariant === 'string'
            ? message.selectedVariant
            : null;
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabKey = activeTab?.id ? `tab_${activeTab.id}` : 'tab_latest';
        const sessionData = await chrome.storage.session.get([
          tabKey,
          'tab_latest',
        ]);
        const entry = (sessionData[tabKey] || sessionData.tab_latest) as
          { signal?: ExtractedPageProductSignal } | undefined;

        const settings = await getSettings();

        if (!entry?.signal) {
          sendResponse({
            ok: true,
            settings,
            signal: null,
            data: null,
          });
          return;
        }

        const effectiveSignal: ExtractedPageProductSignal = overrideVariant
          ? { ...entry.signal, selectedVariant: overrideVariant }
          : entry.signal;

        const fullLookup = await fetchExtensionLookup(effectiveSignal, 'full');
        sendResponse({
          ok: true,
          settings,
          signal: effectiveSignal,
          data: fullLookup,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : 'Full lookup failed',
        });
      }
    })();
    return true;
  }

  if (msgType === 'RATE_SIDEPANEL_QUICK_QUERY') {
    (async () => {
      try {
        const rawQuery =
          typeof message.query === 'string' ? message.query.trim() : '';
        const settings = await getSettings();
        if (!rawQuery) {
          sendResponse({
            ok: false,
            error: 'Vui lòng nhập tên sản phẩm hoặc dán link TMĐT.',
          });
          return;
        }

        const isUrl = /^https?:\/\//i.test(rawQuery);
        const canonicalUrl = isUrl
          ? sanitizeProductUrl(rawQuery) || rawQuery.split('?')[0] || rawQuery
          : '';
        const detectedPlatform = isUrl
          ? detectEcommercePlatform(canonicalUrl)
          : null;
        const extractedIds =
          isUrl && detectedPlatform
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
        if (isUrl) {
          params.set('url', syntheticSignal.canonicalUrl);
        }
        if (extractedIds.externalItemId) {
          params.set('externalId', extractedIds.externalItemId);
        }
        if (extractedIds.externalShopId) {
          params.set('shopId', extractedIds.externalShopId);
        }
        params.set('title', rawQuery);

        const endpoint = `${settings.apiBaseUrl}${RATE_API_V1_ENDPOINTS.EXTENSION_LOOKUP}?${params.toString()}`;
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Rate-Extension-Version': '2.0.0',
          },
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          sendResponse({
            ok: true,
            settings,
            signal: syntheticSignal,
            data: null,
          });
          return;
        }

        const json = (await response.json()) as {
          ok?: boolean;
          data?: ExtensionLookupData;
        };
        const fullLookup = json.ok && json.data ? json.data : null;

        if (fullLookup?.platform) {
          syntheticSignal.platform = fullLookup.platform;
        }

        await chrome.storage.session.set({
          tab_latest: { signal: syntheticSignal, updatedAt: Date.now() },
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
