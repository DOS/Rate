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
  badgeLabel: string;
  explanation: string;
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
  merchant: {
    id: string;
    name: string;
    is_official: boolean;
    risk_score: number;
    dosafe_risk_score: number;
    review_risk_score: number;
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
    dosafe_risk_score: number;
    review_risk_score: number;
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
  compareUrl: string | null;
  productDetailUrl: string | null;
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
    tabs: {
      query: (queryInfo: {
        active?: boolean;
        currentWindow?: boolean;
      }) => Promise<ChromeTab[]>;
      create: (createProperties: { url: string }) => Promise<ChromeTab>;
    };
  };
}
