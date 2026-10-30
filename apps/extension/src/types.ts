export type SupportedEcommercePlatform =
  | 'shopee'
  | 'lazada'
  | 'tiki'
  | 'tiktok'
  | 'cellphones'
  | 'tgdd'
  | 'fptshop'
  | 'hoangha'
  | 'didongviet'
  | 'phongvu';

export type ExtensionPriceVerdict =
  | 'genuine_deal'
  | 'fair_market_price'
  | 'above_market'
  | 'inflated_fake_sale'
  | 'insufficient_data'
  | 'accessory_skip';

export type ExtensionMatchStatus =
  | 'exact_listing'
  | 'canonical_model'
  | 'ambiguous_variant'
  | 'accessory_skip'
  | 'not_found';

export interface ExtensionVariantCandidate {
  storageGb: number;
  label: string;
  slug: string;
  minPrice: number;
  maxPrice: number;
}

export interface ExtensionPriceAssessment {
  verdict: ExtensionPriceVerdict;
  /** Vietnamese text from the server; shown when `messageKey` is unknown. */
  badgeLabel: string;
  explanation: string;
  /**
   * Names the verdict text so the extension shows it in its own language
   * (DOS/Rate#1326); absent from older servers.
   */
  messageKey?: string;
  /** The values that text interpolates: numbers, or `keyword` as text. */
  messageParams?: Record<string, number | string>;
  observedPrice: number | null;
  observedOriginalPrice: number | null;
  claimedDiscountPct: number;
  vsMarketMedianPct: number | null;
  marketMinPrice: number | null;
  marketMedianPrice: number | null;
  marketMaxPrice: number | null;
  historicalMinPrice: number | null;
  historicalMaxPrice: number | null;
  cheaperOfferCount: number;
  maxSavingsAmount: number;
  /**
   * Set with `insufficient_data` when the page's price is far below every
   * other store (DOS/Rate#797): a warning, never "OK" (DOS/Rate#1298).
   */
  implausiblyLow?: boolean;
}

export interface ExtensionOfferItem {
  id: string;
  platform: string;
  title: string;
  price_current: number;
  price_original: number | null;
  rating_star: number;
  rating_count: number;
  historical_sold: number;
  url: string;
  /**
   * A sold-out or discontinued listing keeps its last price
   * (DOS/Rate#1141, #1297); absent when the server did not read it.
   */
  availability?: 'in_stock' | 'out_of_stock' | 'discontinued' | null;
  /** A bait price far below every other in-stock store (DOS/Rate#1297). */
  implausiblyLow?: boolean;
  merchant: {
    id: string;
    name: string;
    is_official: boolean;
    risk_score: number;
    /** `null` when the seller has no stored score (DOS/Rate#1099). */
    dosafe_risk_score: number | null;
    review_risk_score: number | null;
  };
}

export interface ExtensionPriceHistoryPoint {
  id: string;
  product_id: string;
  merchant_name: string;
  platform: string;
  price: number;
  price_original: number | null;
  recorded_at: string;
}

export interface ExtensionLookupData {
  matchStatus: ExtensionMatchStatus;
  platform: SupportedEcommercePlatform | null;
  canonicalUrl: string | null;
  detectedStorageGb: number | null;
  isAccessoryOrPart: boolean;
  accessoryReason: string | null;
  variantCandidates: ExtensionVariantCandidate[];
  priceAssessment: ExtensionPriceAssessment;
  masterProduct: {
    id: string;
    slug: string;
    name: string;
    brand: string;
    model: string;
    storage_gb: number | null;
    ram_gb: number | null;
    min_price: number;
    max_price: number;
    merchant_count: number;
    average_rating: number;
    user_rating_weighted: number;
    expert_rating: number | null;
    authentic_review_count: number;
    total_reviews: number;
    key_specs?: {
      screen?: string;
      chip?: string;
      camera?: string;
      battery?: string;
      storage?: string;
      ram?: string;
    } | null;
  } | null;
  matchedOffer: ExtensionOfferItem | null;
  topCheaperOffers: ExtensionOfferItem[];
  allOffers: ExtensionOfferItem[];
  merchantProfile: {
    id: string;
    name: string;
    is_official: boolean;
    trust_score: number;
    risk_score: number;
    /** Null when no DOSafe score is known (DOS/Rate#1465). */
    dosafe_risk_score: number | null;
    /** Null when the store has no analysed review (DOS/Rate#1258). */
    review_risk_score: number | null;
  } | null;
  reviewSummary: {
    total_analyzed: number;
    authentic_pct: number;
    suspicious_pct: number;
    fake_pct: number;
    pros: string[];
    cons: string[];
    ai_summary: string | null;
  } | null;
  priceHistory: {
    points: ExtensionPriceHistoryPoint[];
    lowestEverPrice: number | null;
    highestEverPrice: number | null;
    currentMinPrice: number | null;
  } | null;
  categorySlug?:
    'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';
  compareUrl: string | null;
  productDetailUrl: string | null;
  /**
   * Set when rate.vn runs the Item model (DOS/Rate#1158): the product line
   * across sizes, and the size the page states (null: not stated).
   */
  item?: {
    id: string;
    slug: string;
    name: string;
    min_price: number;
    max_price: number;
    price_variant_count: number;
  };
  selectedVariant?: string | null;
  leaderboardUrl?: string | null;
  versusUrl?: string | null;
  topRivalName?: string | null;
  leaderboardStandings?: Array<{
    criterion: string;
    rank: number;
    totalInCategory: number;
    score5: number;
    score10: number;
    categorySlug: string;
  }> | null;
  radarSignal?: {
    verdict: 'genuine_deal' | 'fake_sale_trap' | 'none';
    savingsPct: number;
    fakeMarkupPct: number;
    spreadPct: number;
  } | null;
}

export interface ExtractedPageProductSignal {
  platform: SupportedEcommercePlatform;
  canonicalUrl: string;
  externalItemId: string | null;
  externalShopId: string | null;
  title: string;
  selectedVariant: string | null;
  price: number | null;
  originalPrice: number | null;
  ratingStar: number | null;
  ratingCount: number | null;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  crowdContributeOptIn: boolean;
}

// Minimal Chrome Extension Manifest V3 Ambient Declarations for strict TS 7.0.2
export interface ChromeTab {
  id?: number;
  windowId?: number;
  active?: boolean;
  url?: string;
  title?: string;
}

export interface ChromeMessageSender {
  tab?: ChromeTab;
  url?: string;
}

declare global {
  const chrome: {
    runtime: {
      id: string;
      getURL: (path: string) => string;
      getManifest: () => { version: string };
      sendMessage: <T = unknown>(message: unknown) => Promise<T>;
      onMessage: {
        addListener: (
          callback: (
            message: Record<string, unknown>,
            sender: ChromeMessageSender,
            sendResponse: (response: unknown) => void
          ) => boolean | void
        ) => void;
      };
      onInstalled: {
        addListener: (
          callback: (details: { reason: string }) => void | Promise<void>
        ) => void;
      };
    };
    storage: {
      local: {
        get: (
          keys?: string | string[] | Record<string, unknown>
        ) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
      };
      session: {
        get: (
          keys?: string | string[] | Record<string, unknown>
        ) => Promise<Record<string, unknown>>;
        set: (items: Record<string, unknown>) => Promise<void>;
      };
      onChanged?: {
        addListener: (
          callback: (
            changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
            areaName: string
          ) => void
        ) => void;
      };
    };
    sidePanel: {
      setPanelBehavior: (behavior: {
        openPanelOnActionClick: boolean;
      }) => Promise<void>;
      open: (options: { tabId?: number; windowId?: number }) => Promise<void>;
    };
    action: {
      setBadgeText: (details: {
        text: string;
        tabId?: number;
      }) => Promise<void>;
      setBadgeBackgroundColor: (details: {
        color: string;
        tabId?: number;
      }) => Promise<void>;
      onClicked: {
        addListener: (
          callback: (tab: ChromeTab) => void | Promise<void>
        ) => void;
      };
    };
    /** Absent outside the extension, e.g. in tests (DOS/Rate#1304). */
    i18n?: {
      getMessage: (name: string, substitutions?: string | string[]) => string;
    };
    tabs: {
      query: (queryInfo: {
        active?: boolean;
        currentWindow?: boolean;
      }) => Promise<ChromeTab[]>;
      create: (createProperties: { url: string }) => Promise<ChromeTab>;
    };
  };
}
