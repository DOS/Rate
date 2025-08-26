import type { Core } from '@strapi/strapi';

declare global {
  var strapi: Core.Strapi;
}

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
    this.strapi = strapiInstance || global.strapi;
    if (!this.strapi) {
      console.error('[ListingProcessor] ERROR: Strapi instance not available!');
      throw new Error('Strapi instance is required for ListingProcessor');
    }
    console.log('[ListingProcessor] Initialized with strapi instance:', !!this.strapi);
  }

  /**
   * Xử lý data từ extension và tạo Listing
   */
  async processShopeeData(data: ShopeeData): Promise<ProcessingResult> {
    try {
      const productUrl = data.product.productUrl || '';
      console.log('[ListingProcessor] Processing Shopee data for URL:', productUrl);
      
      // Lấy hoặc tạo Platform Shopee
      const platform = await this.getOrCreateShopeePlatform();
      console.log('[ListingProcessor] Platform ID:', platform.id);
      
      // Kiểm tra xem listing đã tồn tại chưa
      const existingListing = await this.findExistingListing(productUrl, platform.id);
      
      if (existingListing) {
        console.log('[ListingProcessor] ✅ Listing already exists with ID:', existingListing.id, 'listing_id:', existingListing.listing_id);
        return {
          success: true,
          action: 'existing_listing',
          listingId: existingListing.id,
          message: `Listing already exists (ID: ${existingListing.id}, listing_id: ${existingListing.listing_id})`
        };
      }

      // Tạo listing mới
      const newListing = await this.createNewListing(data, platform.id);
      
      console.log('[ListingProcessor] ✨ Created new listing:', newListing.id, 'listing_id:', newListing.listing_id);
      return {
        success: true,
        action: 'created_listing',
        listingId: newListing.id,
        message: `New listing created (ID: ${newListing.id}, listing_id: ${newListing.listing_id})`
      };
      
    } catch (error) {
      console.error('[ListingProcessor] Error processing Shopee data:', error);
      throw error;
    }
  }

  /**
   * Tìm listing đã tồn tại dựa trên Platform và ListingID
   */
  private async findExistingListing(productUrl: string, platformId: number): Promise<any> {
    try {
      // Get platform to get its PlatformID
      const platform = await this.strapi.entityService.findOne('api::platform.platform', platformId);
      if (!platform) {
        console.log('[ListingProcessor] Platform not found:', platformId);
        return null;
      }
      
      // Use PlatformID field (fallback to Slug)
      const platformIdentifier = platform.PlatformID || platform.Slug;
      
      // Extract product ID từ URL (mỗi platform có format khác nhau)
      let listingId: string | null = null;
      
      if (productUrl.includes('shopee.vn')) {
        const productId = this.extractProductId(productUrl);
        const shopId = this.extractShopId(productUrl);
        // Format: platformIdentifier.shopId_productId
        const uniqueId = productId && shopId ? `${shopId}_${productId}` : null;
        listingId = uniqueId ? `${platformIdentifier}.${uniqueId}` : null;
        console.log('[ListingProcessor] Extracted IDs - PlatformID:', platformIdentifier, 'ShopID:', shopId, 'ProductID:', productId, 'ListingID:', listingId);
      }
      // Thêm logic cho các platform khác ở đây
      else if (productUrl.includes('lazada.vn')) {
        // Format: platformIdentifier.productId
        const productId = this.extractProductId(productUrl);
        listingId = productId ? `${platformIdentifier}.${productId}` : null;
      }
      else if (productUrl.includes('tiki.vn')) {
        // Format: platformIdentifier.productId
        const productId = this.extractProductId(productUrl);
        listingId = productId ? `${platformIdentifier}.${productId}` : null;
      }
      
      if (!listingId) {
        console.log('[ListingProcessor] Could not extract ListingID from URL:', productUrl);
        return null;
      }
      
      // Tìm listing theo Platform và listing_id (database field name)
      console.log('[ListingProcessor] Searching for existing listing with Platform:', platformId, 'listing_id:', listingId);
      const listings = await this.strapi.entityService.findMany('api::listing.listing', {
        filters: {
          Platform: { id: platformId },
          listing_id: listingId  // Use actual database field name
        },
        populate: '*' as any
      });

      const found = listings && listings.length > 0;
      console.log('[ListingProcessor] Found existing listing:', found, 'Count:', listings?.length || 0);
      return found ? listings[0] : null;
    } catch (error) {
      console.error('[ListingProcessor] Error finding existing listing:', error);
      return null;
    }
  }

  /**
   * Tìm hoặc tạo Platform Shopee
   */
  private async getOrCreateShopeePlatform(): Promise<any> {
    try {
      // Tìm platform Shopee Việt Nam theo PlatformID hoặc Slug
      const platforms = await this.strapi.entityService.findMany('api::platform.platform', {
        filters: {
          $or: [
            { PlatformID: 'shopee-vn' },
            { Slug: 'shopee-vn' },
            { Slug: 'shopee' }
          ]
        }
      });
      
      if (platforms && platforms.length > 0) {
        return platforms[0];
      }
      
      // Nếu chưa có, tạo mới với PlatformID, Country và PlatformLocale
      return await this.strapi.entityService.create('api::platform.platform', {
        data: {
          Name: 'Shopee Việt Nam',
          Slug: 'shopee-vn',
          PlatformID: 'shopee-vn', // Set PlatformID field
          URL: 'https://shopee.vn',
          Country: 'VN',
          PlatformLocale: 'vi',
          is_Active: true
        }
      });
    } catch (error) {
      console.error('[ListingProcessor] Error getting/creating Shopee platform:', error);
      throw error;
    }
  }

  /**
   * Tạo listing mới từ Shopee data
   */
  private async createNewListing(data: ShopeeData, platformId: number): Promise<any> {
    try {
      const { product, seller, review } = data;
      
      // Get platform to get its PlatformID
      const platform = await this.strapi.entityService.findOne('api::platform.platform', platformId);
      if (!platform) {
        throw new Error(`Platform not found with ID: ${platformId}`);
      }
      
      // Use PlatformID field (required)
      const platformIdentifier = platform.PlatformID || platform.Slug;
      if (!platformIdentifier) {
        throw new Error(`Platform ${platform.Name || platformId} is missing PlatformID field`);
      }
      
      // Use PlatformLocale from platform or determine based on Country/URL
      type LocaleType = 'vi' | 'en' | 'cs' | 'zh' | 'th' | 'id' | 'ms' | 'ja' | 'ko' | 'de' | 'fr' | 'sk' | 'pl';
      let locale: LocaleType = platform.PlatformLocale || 'vi'; // Default to Vietnamese
      
      // Fallback logic if PlatformLocale field is not set
      if (!platform.PlatformLocale) {
        // Try to determine from Country field
        if (platform.Country) {
          const countryLocaleMap: { [key: string]: LocaleType } = {
            'VN': 'vi',
            'US': 'en',
            'UK': 'en',
            'CZ': 'cs',
            'CN': 'zh',
            'TH': 'th',
            'ID': 'id',
            'MY': 'ms',
            'JP': 'ja',
            'KR': 'ko',
            'DE': 'de',
            'FR': 'fr',
            'SK': 'sk',
            'PL': 'pl'
          };
          locale = countryLocaleMap[platform.Country] || 'en';
        }
        // Last resort: check URL
        else if (platform.URL?.includes('.vn')) {
          locale = 'vi';
        } else if (platform.URL?.includes('.cz')) {
          locale = 'cs';
        }
      }
      
      // Extract IDs để tạo ListingID unique với format: platformIdentifier.uniqueId
      const productId = this.extractProductId(product.productUrl || '');
      const shopId = this.extractShopId(product.productUrl || '');
      const uniqueId = productId && shopId ? `${shopId}_${productId}` : null;
      const listingId = uniqueId ? `${platformIdentifier}.${uniqueId}` : null;
      
      // Find or create category based on product category
      const category = await this.findOrCreateCategory(product.category || '');
      
      // Upload images to Strapi Media Library (temporarily disabled - needs proper implementation)
      // const mediaIds = await this.uploadProductImages(product.images || [], product.title || '');
      
      // Chuẩn bị listing data với tất cả fields mới
      const listingData: any = {
        Title: product.title || 'Sản phẩm Shopee',
        Slug: this.generateSlug(product.title || 'san-pham-shopee'),
        URL: product.productUrl || '',
        Description: product.description || '',
        IsActive: true,
        Status: 'pending', // Set pending để review
        ReviewNotes: `Nhập từ Shopee. Giá: ${product.price?.toLocaleString('vi-VN')} ${product.currency}. Người bán: ${this.toTitleCase(seller.name || '')}`,
        listing_id: listingId, // ID unique từ platform - use database field name
        Platform: platformId, // Relation tới Platform
        locale: locale, // Set locale based on platform
        
        // Generic fields - data chung cho mọi platform
        Price: product.price || 0,
        Currency: product.currency || 'VND',
        PriceUnit: 'Item', // Default là per Item (capital I), có thể là 'Hour', 'Day', 'Month'
        AverageRating: product.rating || 0, // Will be recalculated from actual reviews
        TotalReviews: 0, // Start at 0, will increment when reviews are added
        SoldCount: product.soldCount || 0,
        UsageCount: product.soldCount || 0, // Map sold count to usage count
        Stock: product.stock || 0,
        PlatformOwnerID: shopId || '', // Shop ID là owner ID cho Shopee
        PlatformOwnerName: this.toTitleCase(seller.name || ''), // Normalize to Title Case
        Brand: product.brand || '', // Keep original brand casing (SAMSUNG, Apple, etc.)
        Location: product.shipFrom || '',
        
        // Relations
        Category: category ? [category] : [], // Link to category if found
        // Media: mediaIds, // Temporarily disabled - needs proper implementation
        
        // Dynamic Zone Properties - Shopee không cung cấp specs chi tiết
        // Có thể extract từ description hoặc dùng AI sau
        Property: [],
        
        /* TODO: Future enhancement - extract specs từ description
        Property: [
          {
            __component: 'property.phone-display',
            Size: null, // Extract từ description
            Type: null,
            RefreshRate: null
          }
        ],
        */
        
        // Metadata từ Shopee - lưu tất cả platform-specific data vào đây
        Metadata: {
          product: {
            productId: productId,
            shopId: shopId,
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
   * Convert string to Title Case
   */
  private toTitleCase(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Find or create category based on Shopee category string
   */
  private async findOrCreateCategory(categoryString: string): Promise<any> {
    try {
      if (!categoryString) return null;
      
      // Parse Shopee category format: "Shopee > Điện Thoại & Phụ Kiện > Điện thoại > Samsung"
      const categories = categoryString.split('>').map(c => c.trim());
      
      // Try to find main category (e.g., "Điện thoại" or "Cell Phones")
      const mainCategory = categories.find(c => 
        c.toLowerCase().includes('điện thoại') || 
        c.toLowerCase().includes('phone') ||
        c.toLowerCase().includes('cell')
      );
      
      if (!mainCategory) return null;
      
      // Find existing category by name or slug
      const existingCategories = await this.strapi.entityService.findMany('api::category.category', {
        filters: {
          $or: [
            { Name: { $containsi: 'phone' } },
            { Name: { $containsi: 'điện thoại' } },
            { Slug: 'cell-phones' }
          ]
        }
      });
      
      if (existingCategories && existingCategories.length > 0) {
        return existingCategories[0];
      }
      
      // If not found, create new category
      const newCategory = await this.strapi.entityService.create('api::category.category', {
        data: {
          Name: 'Cell Phones',
          Slug: 'cell-phones',
          Type: 'Product' // Required field with capital P
        }
      });
      
      return newCategory;
      
    } catch (error) {
      console.error('[ListingProcessor] Error finding/creating category:', error);
      return null;
    }
  }

  /**
   * Upload product images to Strapi Media Library
   */
  private async uploadProductImages(imageUrls: string[], productTitle: string): Promise<number[]> {
    try {
      if (!imageUrls || imageUrls.length === 0) return [];
      
      const mediaIds: number[] = [];
      
      for (let i = 0; i < Math.min(imageUrls.length, 5); i++) { // Limit to 5 images
        try {
          const imageUrl = imageUrls[i];
          
          // Download image from URL
          const response = await fetch(imageUrl);
          if (!response.ok) continue;
          
          const buffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(buffer);
          
          // Create file info
          const fileName = `${this.generateSlug(productTitle)}-${i + 1}.jpg`;
          
          // Upload to Strapi
          const uploadedFile = await this.strapi.plugin('upload').service('upload').upload({
            data: {
              fileInfo: {
                name: fileName,
                caption: `${productTitle} - Image ${i + 1}`,
                alternativeText: productTitle
              }
            },
            files: {
              path: imageUrl,
              name: fileName,
              type: 'image/jpeg',
              size: uint8Array.length,
              buffer: Buffer.from(uint8Array)
            }
          });
          
          if (uploadedFile && uploadedFile[0]) {
            mediaIds.push(uploadedFile[0].id);
          }
          
        } catch (error) {
          console.error(`[ListingProcessor] Error uploading image ${i}:`, error);
        }
      }
      
      return mediaIds;
      
    } catch (error) {
      console.error('[ListingProcessor] Error uploading images:', error);
      return [];
    }
  }

  /**
   * Trích xuất product ID từ Shopee URL
   */
  private extractProductId(url: string): string | null {
    try {
      if (url.includes('shopee.vn')) {
        // Format: https://shopee.vn/product/shopId/productId
        const match = url.match(/product\/(\d+)\/(\d+)/);
        return match ? match[2] : null;
      }
      if (url.includes('lazada.vn')) {
        // Format: https://www.lazada.vn/products/xxx-i123456789.html
        const match = url.match(/i(\d+)/);
        return match ? match[1] : null;
      }
      if (url.includes('tiki.vn')) {
        // Format: https://tiki.vn/xxx-p123456789.html
        const match = url.match(/p(\d+)/);
        return match ? match[1] : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Trích xuất shop ID từ Shopee URL
   */
  private extractShopId(url: string): string | null {
    try {
      // Format: https://shopee.vn/product/shopId/productId
      const match = url.match(/product\/(\d+)\/(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Trích xuất product ID từ Lazada URL
   */
  private extractLazadaProductId(url: string): string | null {
    try {
      // Format: https://www.lazada.vn/products/xxx-i123456789.html
      const match = url.match(/i(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Trích xuất product ID từ Tiki URL  
   */
  private extractTikiProductId(url: string): string | null {
    try {
      // Format: https://tiki.vn/xxx-p123456789.html
      const match = url.match(/p(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
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
   * Calculate average rating from reviews
   */
  async calculateAverageRating(listingId: number): Promise<number> {
    try {
      const reviews = await this.strapi.entityService.findMany('api::review.review', {
        filters: {
          Listing: { id: listingId },
          isActive: true
        },
        fields: ['Rating']
      });
      
      if (!reviews || reviews.length === 0) return 0;
      
      const totalRating = reviews.reduce((sum: number, review: any) => sum + (review.Rating || 0), 0);
      const averageRating = totalRating / reviews.length;
      
      // Update listing with new average rating and review count
      await this.strapi.entityService.update('api::listing.listing', listingId, {
        data: {
          AverageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          TotalReviews: reviews.length
        }
      });
      
      return averageRating;
      
    } catch (error) {
      console.error('[ListingProcessor] Error calculating average rating:', error);
      return 0;
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
