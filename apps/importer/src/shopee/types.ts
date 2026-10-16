/**
 * Open-Core Data Contracts for E-Commerce Product Ingestion
 * Decouples the public Normalization, Entity Matching & AI Spec Enricher engine
 * from private scraper implementations (see DOS/Rate-Services).
 */

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

/**
 * Reviewer metadata scraped alongside a review. What each platform exposes differs
 * (Shopee: user id + shop page; Tiki: join date, review count, purchase flag;
 * retail chains: only a "đã mua" badge), so every field is optional and
 * `undefined` means "the platform does not say", never "no".
 */
export interface ScrapedReviewer {
  /** Pseudonymous stable key (keyed hash of platform + platform user id). Never the raw id. */
  key?: string;
  /** Platform marks the review as anonymous / hides the reviewer's identity. */
  isAnonymous?: boolean;
  /** Public profile page on the platform, when one exists. */
  profileUrl?: string;
  /** Account creation time on the platform (ISO 8601). */
  joinedAt?: string;
  /** Total reviews this account has written on the platform. */
  totalReviews?: number;
  /** Helpful / thank votes this account has received across its reviews. */
  helpfulVotes?: number;
  /** Platform confirms this reviewer bought the item. */
  verifiedPurchase?: boolean;
  /** Purchase time as reported by the platform (ISO 8601). */
  purchasedAt?: string;
  /** Platform flags the reviewer as a repeat buyer of this item/shop. */
  repeatPurchase?: boolean;
}

export interface ShopeeReview {
  reviewId: string;
  author: string;
  authorAvatar?: string;
  ratingStar: number;
  comment: string;
  variation?: string;
  createdAt: string;
  images: string[];
  videos?: string[];
  sellerReply?: string;
  /** Helpful/like count shown on the platform for this review. */
  likeCount?: number;
  reviewer?: ScrapedReviewer;
}

export interface ShopeeProduct {
  /** Platform identifier (defaults to 'shopee' for backward compatibility) */
  platform?: SupportedEcommercePlatform;
  itemId: string;
  shopId: string;
  url: string;
  title: string;
  description?: string;
  priceMin: number;
  priceMax: number;
  priceBeforeDiscount?: number;
  currency: string;
  historicalSold: number;
  stock: number;
  ratingStar: number;
  ratingCount: number;
  ratingScoreDistribution?: number[];
  images: string[];
  models: Array<{
    modelId: string;
    name: string;
    price: number;
    stock: number;
    sku?: string;
  }>;
  attributes: Array<{
    name: string;
    value: string;
  }>;
  shop: {
    shopId: string;
    name: string;
    isMall: boolean;
    ratingStar?: number;
    followerCount?: number;
    location?: string;
    url?: string;
  };
  reviews: ShopeeReview[];
}

export type ScrapedProduct = ShopeeProduct;
export type ScrapedReview = ShopeeReview;
