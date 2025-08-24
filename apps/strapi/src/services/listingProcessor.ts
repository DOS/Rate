import type { Core } from '@strapi/strapi';

/**
 * Listing Processor Service
 * Xử lý data từ Redis Stream và tạo Listing records trong Strapi
 */

interface ShopeeProduct {
  productUrl?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  category?: string;
  brand?: string;
  images?: string[];
  variants?: any[];
  stock?: number;
  shipFrom?: string;
  rating?: number;
  soldCount?: number;
}

interface ShopeeSeller {
  name?: string;
  rating?: number;
  responseRate?: string;
  responseTime?: string;
  joinSince?: string;
  productCount?: number;
  followerCount?: number;
  reviewCount?: number;
}

interface ShopeeReview {
  id?: string;
  username?: string;
  content?: string;
  starRate?: number;
  reviewVariant?: string;
  criteria?: any;
  timestamp?: string;
}

interface ShopeeData {
  product: ShopeeProduct;
  seller: ShopeeSeller;
  review: ShopeeReview;
}

interface ProcessingResult {
  success: boolean;
  action: 'existing_listing' | 'created_listing';
  listingId?: number;
  message: string;
}

interface BatchResult {
  success: boolean;
  processed: number;
  results: Array<{
    itemId: string;
    success: boolean;
    action?: string;
    listingId?: number;
    message?: string;
    error?: string;
  }>;
}

class ListingProcessorService {
  private strapi: Core.Strapi;

  constructor(strapiInstance?: Core.Strapi) {
    this.strapi = strapiInstance || (global as any).strapi;
  }

  /**
   * Xử lý data từ extension và tạo Listing
   */
  async processShopeeData(data: ShopeeData): Promise<ProcessingResult> {
    try {
      console.log('[ListingProcessor] Processing Shopee data:', data);
      
      // Kiểm tra xem listing đã tồn tại chưa
      const existingListing = await this.findExistingListing(data.product.productUrl || '');
      
      if (existingListing) {
        console.log('[ListingProcessor] Listing already exists:', existingListing.id);
        return {
          success: true,
          action: 'existing_listing',
          listingId: existingListing.id,
          message: 'Listing already exists in Strapi'
        };
      }

      // Tạo listing mới
      const newListing = await this.createNewListing(data);
      
      console.log('[ListingProcessor] Created new listing:', newListing.id);
      return {
        success: true,
        action: 'created_listing',
        listingId: newListing.id,
        message: 'New listing created successfully'
      };
      
    } catch (error) {
      console.error('[ListingProcessor] Error processing Shopee data:', error);
      throw error;
    }
  }

  /**
   * Tìm listing đã tồn tại dựa trên URL
   */
  private async findExistingListing(productUrl: string): Promise<any> {
    try {
      const listings = await this.strapi.entityService.findMany('api::listing.listing', {
        filters: {
          URL: productUrl
        },
        populate: '*' as any
      });
      
      return listings && listings.length > 0 ? listings[0] : null;
    } catch (error) {
      console.error('[ListingProcessor] Error finding existing listing:', error);
      return null;
    }
  }

  /**
   * Tạo listing mới từ Shopee data
   */
  private async createNewListing(data: ShopeeData): Promise<any> {
    try {
      const { product, seller, review } = data;
      
      // Chuẩn bị listing data
      const listingData: any = {
        Title: product.title || 'Shopee Product',
        Slug: this.generateSlug(product.title || 'shopee-product'),
        URL: product.productUrl || '',
        Description: product.description || '',
        isActive: true,
        Status: 'pending', // Set pending để review
        ReviewNotes: `Imported from Shopee. Price: ${product.price?.toLocaleString()} ${product.currency}. Seller: ${seller.name}`,
        
        // Metadata từ Shopee
        metadata: {
          shopee: {
            productId: this.extractProductId(product.productUrl || ''),
            shopId: this.extractShopId(product.productUrl || ''),
            price: product.price,
            currency: product.currency,
            category: product.category,
            brand: product.brand,
            stock: product.stock,
            shipFrom: product.shipFrom,
            rating: product.rating,
            soldCount: product.soldCount,
            images: product.images || [],
            variants: product.variants || []
          },
          seller: {
            name: seller.name,
            rating: seller.rating,
            responseRate: seller.responseRate,
            responseTime: seller.responseTime,
            joinSince: seller.joinSince,
            productCount: seller.productCount,
            followerCount: seller.followerCount,
            reviewCount: seller.reviewCount
          },
          // Lưu thông tin review chỉ để reference, không tạo Review record
          crawledReviews: review ? [{
            username: review.username,
            content: review.content,
            starRate: review.starRate,
            reviewVariant: review.reviewVariant,
            criteria: review.criteria,
            timestamp: review.timestamp
          }] : [],
          importSource: 'shopee_extension',
          importedAt: new Date().toISOString()
        }
      };

      // Tạo listing
      const newListing = await this.strapi.entityService.create('api::listing.listing', {
        data: listingData
      });

      // KHÔNG tạo review từ Shopee data
      // Reviews sẽ được người dùng tự thêm hoặc import riêng
      
      return newListing;
      
    } catch (error) {
      console.error('[ListingProcessor] Error creating new listing:', error);
      throw error;
    }
  }

  /**
   * Tạo review cho listing
   */
  private async createReview(listingId: number, reviewData: ShopeeReview): Promise<void> {
    try {
      await this.strapi.entityService.create('api::review.review', {
        data: {
          Title: `Review from ${reviewData.username}`,
          Content: reviewData.content,
          Rating: reviewData.starRate || 0,
          Username: reviewData.username,
          Listing: listingId,
          isActive: true,
          metadata: {
            shopee: {
              reviewId: reviewData.id,
              variant: reviewData.reviewVariant,
              criteria: reviewData.criteria,
              timestamp: reviewData.timestamp
            }
          }
        }
      });

      console.log('[ListingProcessor] Created review for listing:', listingId);
      
    } catch (error) {
      console.error('[ListingProcessor] Error creating review:', error);
      // Không throw error vì review không quan trọng bằng listing
    }
  }

  /**
   * Tạo slug từ title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Trích xuất product ID từ Shopee URL
   */
  private extractProductId(url: string): string | null {
    try {
      const match = url.match(/i\.(\d+)\.(\d+)/);
      return match ? match[2] : null;
    } catch {
      return null;
    }
  }

  /**
   * Trích xuất shop ID từ Shopee URL
   */
  private extractShopId(url: string): string | null {
    try {
      const match = url.match(/i\.(\d+)\.(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Xử lý batch data từ Redis Stream
   */
  async processBatchFromRedis(batchData: { items: ShopeeData[] }): Promise<BatchResult> {
    try {
      console.log('[ListingProcessor] Processing batch from Redis:', batchData);
      
      const results = [];
      
      for (const item of batchData.items || []) {
        try {
          const result = await this.processShopeeData(item);
          results.push({
            itemId: item.review?.id || 'unknown',
            success: result.success,
            action: result.action,
            listingId: result.listingId,
            message: result.message
          });
        } catch (error) {
          results.push({
            itemId: item.review?.id || 'unknown',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return {
        success: true,
        processed: results.length,
        results: results
      };
      
    } catch (error) {
      console.error('[ListingProcessor] Error processing batch:', error);
      throw error;
    }
  }
}

export default ListingProcessorService;
