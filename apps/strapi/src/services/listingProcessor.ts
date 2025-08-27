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
  originalPrice?: number;
  currency?: string;
  category?: string;
  brand?: string;
  images?: string[];
  variants?: any[];
  stock?: number;
  shipFrom?: string;
  rating?: number;
  soldCount?: number;
  likedCount?: number;
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
        console.log('[ListingProcessor] ✅ Listing already exists with ID:', existingListing.id, 'ListingID:', existingListing.ListingID);
        return {
          success: true,
          action: 'existing_listing',
          listingId: existingListing.id,
          message: `Listing already exists (ID: ${existingListing.id}, ListingID: ${existingListing.ListingID})`
        };
      }

      // Tạo listing mới
      const newListing = await this.createNewListing(data, platform.id);
      
      console.log('[ListingProcessor] ✨ Created new listing:', newListing.id, 'ListingID:', newListing.ListingID);
      return {
        success: true,
        action: 'created_listing',
        listingId: newListing.id,
        message: `New listing created (ID: ${newListing.id}, ListingID: ${newListing.ListingID})`
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
      
      // Tìm listing theo Platform và ListingID (Strapi field name)
      console.log('[ListingProcessor] Searching for existing listing with Platform:', platformId, 'ListingID:', listingId);
      const listings = await this.strapi.entityService.findMany('api::listing.listing', {
        filters: {
          Platform: { id: platformId },
          ListingID: listingId  // Use Strapi field name (capital letters)
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
          PlatformLocale: 'vi', // Ensure Vietnamese locale
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
      
      // Use PlatformID field (required) - handle both uppercase (Strapi) and lowercase (DB) field names
      const platformIdentifier = platform.PlatformID || platform.platform_id || platform.Slug || platform.slug;
      if (!platformIdentifier) {
        throw new Error(`Platform ${platform.Name || platform.name || platformId} is missing PlatformID field`);
      }
      
      // Determine locale based on platform
      const platformLocale = platform.PlatformLocale || platform.platform_locale;
      const countryCode = platform.Country || platform.country;
      
      console.log('[ListingProcessor] Platform data:', {
        Name: platform.Name || platform.name,
        PlatformLocale: platformLocale,
        Country: countryCode,
        PlatformID: platform.PlatformID || platform.platform_id
      });
      
      // Map platform locale or country to Strapi locale
      // Priority: platform_locale -> country code -> default
      let locale = 'en'; // Default fallback
      
      // Check platform locale first
      if (platformLocale === 'vi') {
        locale = 'vi';
      } else if (platformLocale === 'en') {
        locale = 'en';
      } else if (platformLocale === 'cs') {
        locale = 'cs';
      } 
      // Then check country code
      else if (countryCode === 'VN') {
        locale = 'vi';
      } else if (countryCode === 'UK' || countryCode === 'US') {
        locale = 'en';
      } else if (countryCode === 'CZ') {
        locale = 'cs';
      }
      // For Shopee Vietnam specifically, force Vietnamese
      else if (platform.Slug === 'shopee-vn' || platform.slug === 'shopee-vn') {
        locale = 'vi';
      }
      
      console.log('[ListingProcessor] Determined locale:', locale, 'for platform:', platform.Name || platform.name);
      
      // Extract IDs để tạo ListingID unique với format: platformIdentifier.uniqueId
      const productId = this.extractProductId(product.productUrl || '');
      const shopId = this.extractShopId(product.productUrl || '');
      const uniqueId = productId && shopId ? `${shopId}_${productId}` : null;
      const listingId = uniqueId ? `${platformIdentifier}.${uniqueId}` : null;
      
      // Find or create category based on product category
      const category = await this.findOrCreateCategory(product.category || '');
      
      // Upload images to Strapi Media Library (temporarily disabled - needs proper implementation)
      // const mediaIds = await this.uploadProductImages(product.images || [], product.title || '');
      
      // Convert description to Blocks format for Strapi
      const descriptionBlocks = product.description ? [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: product.description
            }
          ]
        }
      ] : [];

      // Chuẩn bị listing data với tất cả fields mới
      const listingData: any = {
        Title: product.title || 'Sản phẩm Shopee',
        Slug: this.generateSlug(product.title || 'san-pham-shopee'),
        URL: product.productUrl || '',
        Description: descriptionBlocks, // Use Blocks format
        IsActive: true,
        ListingStatus: 'Pending', // Set Pending để review - use correct field name with capital P
        ReviewNotes: `Nhập từ Shopee. Giá: ${product.price?.toLocaleString('vi-VN')} ${product.currency}. Người bán: ${this.toTitleCase(seller.name || '')}`,
        ListingID: listingId, // ID unique từ platform - use Strapi field name
        Platform: platformId, // Relation tới Platform
        locale: locale, // Set locale based on platform
        
        // Generic fields - data chung cho mọi platform
        Price: product.price || 0,
        OriginalPrice: product.price || 0, // Add OriginalPrice (can be updated later if have discount info)
        Currency: product.currency || 'VND',
        PriceUnit: 'Item', // Default là per Item (capital I), có thể là 'Hour', 'Day', 'Month'
        AverageRating: product.rating || 0, // Rating from Shopee
        TotalReviews: seller.reviewCount || 0, // Use seller's review count
        SoldCount: product.soldCount || 0, // Map to sold_count field
        UsageCount: product.soldCount || 0, // Map sold count to usage count
        Stock: product.stock || 0,
        PlatformOwnerID: shopId || '', // Shop ID là owner ID cho Shopee
        PlatformOwnerName: this.toTitleCase(seller.name || ''), // Normalize to Title Case
        Brand: product.brand || '', // Keep original brand casing (SAMSUNG, Apple, etc.)
        Location: product.shipFrom || '',
        LastUpdated: new Date().toISOString(), // Add LastUpdated timestamp
        FavoriteCount: 0, // Initialize FavoriteCount (will be updated when users add to favorites)
        ViewCount: 0, // Initialize ViewCount
        
        // Relations
        Category: category ? category.id : null, // Link to category if found (use ID directly)
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

      // Log the data being sent to Strapi
      console.log('[ListingProcessor] Creating listing with locale:', listingData.locale);
      console.log('[ListingProcessor] Full listing data:', JSON.stringify({
        Title: listingData.Title,
        ListingID: listingData.ListingID,
        Platform: listingData.Platform,
        locale: listingData.locale,
        Price: listingData.Price,
        Currency: listingData.Currency
      }, null, 2));
      
      // Log final data before creating
      console.log('[ListingProcessor] Creating listing with data:', {
        Title: listingData.Title,
        locale: listingData.locale,
        Platform: listingData.Platform,
        ListingID: listingData.ListingID
      });
      
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
      const categories = categoryString.split('>').map(c => c.trim()).filter(c => c && c !== 'Shopee');
      
      console.log('[ListingProcessor] Parsing category:', categoryString, 'Categories:', categories);
      
      // Category mapping for common Vietnamese e-commerce categories
      const categoryMap: { [key: string]: { name: string; slug: string } } = {
        // Electronics
        'điện thoại': { name: 'Điện thoại', slug: 'dien-thoai' },
        'phone': { name: 'Điện thoại', slug: 'dien-thoai' },
        'laptop': { name: 'Laptop', slug: 'laptop' },
        'máy tính': { name: 'Máy tính', slug: 'may-tinh' },
        'tablet': { name: 'Máy tính bảng', slug: 'may-tinh-bang' },
        'máy tính bảng': { name: 'Máy tính bảng', slug: 'may-tinh-bang' },
        
        // Fashion
        'thời trang': { name: 'Thời trang', slug: 'thoi-trang' },
        'quần áo': { name: 'Quần áo', slug: 'quan-ao' },
        'giày dép': { name: 'Giày dép', slug: 'giay-dep' },
        'túi xách': { name: 'Túi xách', slug: 'tui-xach' },
        
        // Beauty
        'mỹ phẩm': { name: 'Mỹ phẩm', slug: 'my-pham' },
        'làm đẹp': { name: 'Làm đẹp', slug: 'lam-dep' },
        'sức khỏe': { name: 'Sức khỏe', slug: 'suc-khoe' },
        
        // Home & Living
        'nhà cửa': { name: 'Nhà cửa & Đời sống', slug: 'nha-cua' },
        'đời sống': { name: 'Nhà cửa & Đời sống', slug: 'nha-cua' },
        'nội thất': { name: 'Nội thất', slug: 'noi-that' },
        
        // Mother & Baby
        'mẹ & bé': { name: 'Mẹ & Bé', slug: 'me-va-be' },
        'mẹ và bé': { name: 'Mẹ & Bé', slug: 'me-va-be' },
        'đồ chơi': { name: 'Đồ chơi', slug: 'do-choi' },
        
        // Sports & Outdoors
        'thể thao': { name: 'Thể thao & Du lịch', slug: 'the-thao' },
        'du lịch': { name: 'Thể thao & Du lịch', slug: 'the-thao' },
        
        // Automotive
        'ô tô': { name: 'Ô tô & Xe máy', slug: 'o-to-xe-may' },
        'xe máy': { name: 'Ô tô & Xe máy', slug: 'o-to-xe-may' },
        'phụ kiện xe': { name: 'Phụ kiện xe', slug: 'phu-kien-xe' },
        
        // Books & Stationery
        'sách': { name: 'Sách & Văn phòng phẩm', slug: 'sach' },
        'văn phòng phẩm': { name: 'Sách & Văn phòng phẩm', slug: 'sach' },
        
        // Food & Beverage
        'thực phẩm': { name: 'Thực phẩm', slug: 'thuc-pham' },
        'đồ ăn': { name: 'Thực phẩm', slug: 'thuc-pham' }
      };
      
      // Try to find matching category from the parsed strings
      let matchedCategory = null;
      
      for (const cat of categories) {
        const catLower = cat.toLowerCase();
        for (const [keyword, categoryInfo] of Object.entries(categoryMap)) {
          if (catLower.includes(keyword)) {
            matchedCategory = categoryInfo;
            break;
          }
        }
        if (matchedCategory) break;
      }
      
      // If no match found, use the first meaningful category string as-is
      if (!matchedCategory && categories.length > 0) {
        const firstCategory = categories[0];
        matchedCategory = {
          name: firstCategory,
          slug: this.generateSlug(firstCategory)
        };
      }
      
      if (!matchedCategory) return null;
      
      // Find existing category by slug or name
      const existingCategories = await this.strapi.entityService.findMany('api::category.category', {
        filters: {
          $or: [
            { Slug: matchedCategory.slug },
            { Name: matchedCategory.name }
          ]
        }
      });
      
      if (existingCategories && existingCategories.length > 0) {
        console.log('[ListingProcessor] Found existing category:', existingCategories[0].Name);
        return existingCategories[0];
      }
      
      // If not found, create new category
      const newCategory = await this.strapi.entityService.create('api::category.category', {
        data: {
          Name: matchedCategory.name,
          Slug: matchedCategory.slug,
          Type: 'Product' // Required field with capital P
        }
      });
      
      console.log('[ListingProcessor] Created new category:', newCategory.Name);
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
