/**
 * Open-Core Data Contracts for E-Commerce Product Ingestion
 * Decouples the public Normalization, Entity Matching & AI Spec Enricher engine
 * from private scraper implementations (see DOS/Rate-Services).
 */

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
}

export interface ShopeeProduct {
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
  };
  reviews: ShopeeReview[];
}
