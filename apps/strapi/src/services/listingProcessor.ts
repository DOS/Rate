import type { Core } from '@strapi/strapi';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TitleNormalizer } from './titleNormalizer';
import { ItemValidator } from './itemValidator';
import { uploadProductImages } from './uploadProductImages';

declare global {
  var strapi: Core.Strapi;
}

/**
 * Listing Processor Service
 * Xử lý data từ Redis Stream và tạo Listing records trong Strapi
 */

interface ShopeeProduct {
  ListingID?: string; // Added for UnifiedValidationService
  url?: string; // Extension sends 'url' field
  productUrl?: string; // Some places use 'productUrl'
  title?: string; // Some places use 'title'
  productName?: string; // Extension sends 'productName'
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
  productReviewCount?: number;
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
  action: 'existing_listing' | 'created_listing' | 'updated_existing_listing' | 'skipped_duplicate';
  listingId?: number | null;
  message: string;
}

interface BatchResult {
  success: boolean;
  processed: number;
  results: Array<{
    itemId: string;
    success: boolean;
    action?: string;
    listingId?: number | null;
    message?: string;
    error?: string;
  }>;
}

class ListingProcessorService {
  private strapi: Core.Strapi;
  private titleNormalizer: TitleNormalizer;
  private itemValidator: ItemValidator;

  constructor(strapiInstance: Core.Strapi) {
    this.strapi = strapiInstance;
    if (!this.strapi) {
      throw new Error('[ListingProcessor] ERROR: Strapi instance is required!');
    }
    this.titleNormalizer = new TitleNormalizer();
    this.itemValidator = new ItemValidator();
    console.log('[ListingProcessor] Initialized with strapi instance:', !!this.strapi);
  }

  /**
   * Parse price from Vietnamese format string (e.g., "39.999.000" -> 39999000)
   */
  private parseVietnamesePrice(price: any): number {
    if (typeof price === 'number') {
      return price;
    }
    if (typeof price === 'string') {
      // Remove dots (thousand separators) and commas, then parse
      const cleanPrice = price.replace(/[.,]/g, '');
      const parsedPrice = parseFloat(cleanPrice);
      if (!isNaN(parsedPrice)) {
        console.log('[ListingProcessor] Parsed price from string:', price, '->', parsedPrice);
        return parsedPrice;
      }
    }
    console.log('[ListingProcessor] Could not parse price:', price, 'returning 0');
    return 0;
  }

  /**
   * Xử lý data từ extension và tạo Listing
   */
  async processShopeeData(data: ShopeeData): Promise<ProcessingResult> {
    try {
      // Parse price if it's in Vietnamese format
      if (data.product.price !== undefined) {
        data.product.price = this.parseVietnamesePrice(data.product.price);
      }
      if (data.product.originalPrice !== undefined) {
        data.product.originalPrice = this.parseVietnamesePrice(data.product.originalPrice);
      }

      const productUrl = data.product.url || data.product.productUrl || '';
      console.log('[ListingProcessor] Processing Shopee data for URL:', productUrl);
      console.log('[ListingProcessor] Product data received:', JSON.stringify(data.product, null, 2));
      console.log('[ListingProcessor] Seller data received:', JSON.stringify(data.seller, null, 2));
      console.log('[ListingProcessor] Stock value:', data.product.stock);
      console.log('[ListingProcessor] Brand value:', data.product.brand);
      console.log('[ListingProcessor] Seller name:', data.seller?.name);
      console.log('[ListingProcessor] Parsed price:', data.product.price);
      
      // Lấy hoặc tạo Platform Shopee
      const platform = await this.getOrCreateShopeePlatform();
      console.log('[ListingProcessor] Platform ID:', platform.id);
      
      // Get ListingID from data (from UnifiedValidationService)
      const listingId = data.product.ListingID || '';
      
      // Kiểm tra xem listing đã tồn tại chưa - pass ListingID directly
      const existingListing = await this.findExistingListingByListingId(listingId, platform.id);
      
      if (existingListing) {
        console.log('[ListingProcessor] ✅ Listing already exists with ID:', existingListing.id, 'ListingID:', existingListing.ListingID);
        
        // Force Vietnamese locale for Shopee Vietnam
        const locale = 'vi';
        
        // Find or create Item for this product
        const fixedCategory = this.fixVietnameseEncoding(data.product.category || '');
        const category = await this.findOrCreateCategory(fixedCategory, locale);
        const item = await this.findOrCreateItem(data.product, category, locale);
        
        // Check if listing already has media
        const existingMediaIds = existingListing.Media && existingListing.Media.length > 0 
          ? existingListing.Media.map((m: any) => typeof m === 'object' ? m.id : m)
          : [];
        
        // Process and upload images for existing listing
        console.log('[ListingProcessor] Processing images for existing listing:', data.product.title);
        console.log('[ListingProcessor] Product images array:', data.product.images);
        console.log('[ListingProcessor] Images count:', data.product.images ? data.product.images.length : 0);

        // Upload images to Media Library if not already uploaded
        let mediaIds = existingMediaIds;
        if (data.product.images && data.product.images.length > 0) {
          const fixedTitle = this.fixVietnameseEncoding(data.product.title || '');
          console.log('[ListingProcessor] Uploading new images for existing listing:', fixedTitle);
          mediaIds = await uploadProductImages(
            this.strapi,
            data.product.images || [],
            fixedTitle || 'Product',
            existingMediaIds, // Pass existing media to avoid duplicates
            existingListing.ListingID || undefined
          );
          console.log('[ListingProcessor] Media IDs after upload:', mediaIds);
        }

        // Also process external image URLs
        const imageResult = await this.processExternalImages(data.product.images || []);
        console.log('[ListingProcessor] External images processed:', imageResult.urls.length, 'URLs');
        
        // Process description blocks for Strapi's blocks field
        const descriptionBlocks = data.product.description ? [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: this.fixVietnameseEncoding(data.product.description)
              }
            ]
          }
        ] : existingListing.Description || [];

        // Update existing listing with new data
        const updatedListing = await this.strapi.entityService.update('api::listing.listing', existingListing.id, {
          data: {
            // Update basic fields
            UsageCount: data.product.soldCount || existingListing.UsageCount || 0,
            LastUpdated: new Date().toISOString(),
            ViewCount: (existingListing.ViewCount || 0) + 1,

            // Update relations - Link Item if not already linked
            Item: item ? item.id : existingListing.Item,

            // Update Media with uploaded images
            Media: mediaIds && mediaIds.length > 0 ? mediaIds : [],

            // Store external image URLs
            ExternalImages: imageResult.urls,

            // Update fields with new data from Shopee
            Stock: data.product.stock !== undefined ? data.product.stock : (existingListing.Stock || 0),
            Brand: this.extractBrandFromProductData(data.product) || existingListing.Brand || '',
            PlatformOwnerName: data.seller ? this.toTitleCase(this.fixVietnameseEncoding(data.seller.name || '')) : existingListing.PlatformOwnerName || 'N/A',
            Description: descriptionBlocks,
            AverageRating: data.product.rating || existingListing.AverageRating || 0,
            TotalReviews: data.product.productReviewCount || existingListing.TotalReviews || 0,
            FavoriteCount: data.product.likedCount || existingListing.FavoriteCount || 0
          },
          locale: locale // Specify locale to prevent updating wrong language version
        });
        
        console.log('[ListingProcessor] Updated UsageCount to:', updatedListing?.UsageCount, 'ViewCount to:', updatedListing?.ViewCount);
        
        // Also update English version if exists
        try {
          console.log('[ListingProcessor] Checking for English version to update');
          
          // Find English version using documentId
          const documentId = existingListing.documentId;
          if (documentId) {
            const englishListing: any = await this.strapi.entityService.findMany('api::listing.listing', {
              filters: {
                documentId: {
                  $eq: documentId
                }
              } as any,
              locale: 'en',
              limit: 1
            });

            if (englishListing && englishListing.length > 0) {
              const enListing = englishListing[0];
              console.log('[ListingProcessor] Found English listing to update:', enListing.id);
              
              // Find English category if VI category exists
              let englishCategoryId = null;
              if (category && category.documentId) {
                const linkedEnCategory = await this.strapi.entityService.findMany('api::category.category', {
                  filters: {
                    documentId: category.documentId,
                    locale: 'en'
                  },
                  limit: 1
                });
                if (linkedEnCategory && linkedEnCategory.length > 0) {
                  englishCategoryId = linkedEnCategory[0].id;
                  console.log(`[ListingProcessor] Found linked English category for update: "${linkedEnCategory[0].Name}"`);
                }
              }

              // Update English version with same data
              await this.strapi.entityService.update('api::listing.listing', enListing.id, {
                data: {
                  UsageCount: data.product.soldCount || enListing.UsageCount || 0,
                  LastUpdated: new Date().toISOString(),
                  ViewCount: (enListing.ViewCount || 0) + 1,
                  Item: item ? item.id : (enListing as any).Item,
                  Category: englishCategoryId || (enListing as any).Category, // Add Category mapping
                  Media: mediaIds && mediaIds.length > 0 ? mediaIds : [],
                  ExternalImages: imageResult.urls.length > 0 ? imageResult.urls : (enListing as any).ExternalImages,
                  Stock: data.product.stock !== undefined ? data.product.stock : (enListing.Stock || 0),
                  Brand: this.extractBrandFromProductData(data.product) || enListing.Brand || '',
                  PlatformOwnerName: data.seller ? this.toTitleCase(this.fixVietnameseEncoding(data.seller.name || '')) : enListing.PlatformOwnerName || 'N/A',
                  Description: descriptionBlocks,
                  AverageRating: data.product.rating || enListing.AverageRating || 0,
                  TotalReviews: data.product.productReviewCount || enListing.TotalReviews || 0,
                  FavoriteCount: data.product.likedCount || enListing.FavoriteCount || 0
                },
                locale: 'en'
              });
              
              console.log('[ListingProcessor] Updated English listing');
            } else {
              console.log('[ListingProcessor] No English listing found to update');
              
              // Create English version if doesn't exist
              console.log('[ListingProcessor] Creating English listing for existing VI listing');
              
              // Get full VI listing data to copy
              const fullViListing = await this.strapi.entityService.findOne('api::listing.listing', existingListing.id, {
                populate: ['Category', 'Platform', 'Item']
              });
              
              if (fullViListing) {
                const viListing = fullViListing as any;
                
                // Find English category using documentId (proper i18n approach)
                let englishCategoryId = null;
                if (viListing.Category) {
                  // Only use documentId linking - no fallback
                  if (viListing.Category.documentId) {
                    const linkedEnCategory = await this.strapi.entityService.findMany('api::category.category', {
                      filters: {
                        documentId: viListing.Category.documentId,
                        locale: 'en'
                      },
                      limit: 1
                    });

                    if (linkedEnCategory && linkedEnCategory.length > 0) {
                      englishCategoryId = linkedEnCategory[0].id;
                      console.log(`[ListingProcessor] Found linked English category: "${linkedEnCategory[0].Name}" for Vietnamese category: "${viListing.Category.Name}"`);
                    } else {
                      console.log(`[ListingProcessor] Warning: No English category with documentId: ${viListing.Category.documentId}`);
                    }
                  } else {
                    console.log(`[ListingProcessor] Warning: Vietnamese category "${viListing.Category.Name}" has no documentId`);
                  }
                }

                const englishListingData: any = {
                  Title: viListing.Title,
                  Slug: viListing.Slug,
                  ListingID: viListing.ListingID,
                  Description: viListing.Description || undefined,
                  Price: viListing.Price,
                  Currency: viListing.Currency,
                  Stock: viListing.Stock,
                  Status: viListing.Status || 'active',
                  URL: viListing.URL,
                  Platform: viListing.Platform?.id || viListing.Platform,
                  Category: englishCategoryId, // Only use English category, no fallback
                  Item: viListing.Item?.id || viListing.Item,
                  ExternalImages: imageResult.urls.length > 0 ? imageResult.urls : viListing.ExternalImages,
                  UsageCount: data.product.soldCount || viListing.UsageCount || 0,
                  ViewCount: (viListing.ViewCount || 0) + 1,
                  AverageRating: data.product.rating || viListing.AverageRating || 0,
                  TotalReviews: data.product.productReviewCount || viListing.TotalReviews || 0,
                  FavoriteCount: data.product.likedCount || viListing.FavoriteCount || 0,
                  LastUpdated: new Date().toISOString(),
                  documentId: documentId // Link to VI version
                };
                
                await this.strapi.entityService.create('api::listing.listing', {
                  data: englishListingData,
                  locale: 'en'
                } as any);
                
                console.log('[ListingProcessor] Created new English listing linked to VI listing');
              }
            }
          }
        } catch (enUpdateError: any) {
          console.log('[ListingProcessor] Could not update/create English listing:', enUpdateError.message);
          // Not critical - VI listing still updated
        }
        
        return {
          success: true,
          action: 'updated_existing_listing',
          listingId: existingListing.id,
          message: `Listing already exists and updated usage count (ID: ${existingListing.id}, UsageCount: ${updatedListing?.UsageCount || 0})`
        };
      }

      // Tạo listing mới
      const newListing = await this.createNewListing(data, platform.id);
      
      // Check if listing was actually created (might be null due to duplicate key error)
      if (!newListing) {
        console.log('[ListingProcessor] ⚠️ Could not create listing - likely duplicate key error handled internally');
        return {
          success: false,
          action: 'skipped_duplicate',
          listingId: null,
          message: 'Could not create listing - duplicate key error, but listing not found'
        };
      }
      
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
   * Tìm listing đã tồn tại dựa trên ListingID (unique across platforms)
   */
  private async findExistingListingByListingId(listingId: string, platformId: number): Promise<any> {
    try {
      if (!listingId) {
        console.log('[ListingProcessor] No ListingID provided');
        return null;
      }

      console.log('[ListingProcessor] Searching for existing listing with ListingID:', listingId);
      
      // Use direct database query - check by listing_id only (unique across platforms)
      const knex = this.strapi.db.connection;
      const existingListings = await knex('listings')
        .where('listing_id', listingId)
        .select('*')
        .limit(1);
      
      if (existingListings && existingListings.length > 0) {
        console.log('[ListingProcessor] Found existing listing in database with ID:', existingListings[0].id);
        
        try {
          // Load full listing with relations using entityService
          // Use documentId if available (Strapi 5), otherwise use id
          const listingId = existingListings[0].documentId || existingListings[0].id;
          const fullListing = await this.strapi.entityService.findOne('api::listing.listing', listingId, {
            populate: ['Media', 'Item', 'Platform', 'Category']
          });
          
          if (fullListing) {
            console.log('[ListingProcessor] Successfully loaded full listing:', fullListing.id);
            return fullListing;
          } else {
            console.log('[ListingProcessor] Warning: Could not load full listing, returning basic data');
            return existingListings[0];
          }
        } catch (loadError) {
          console.error('[ListingProcessor] Error loading full listing:', loadError);
          // Return basic listing data if full load fails
          return existingListings[0];
        }
      }
      
      console.log('[ListingProcessor] No existing listing found in database');
      return null;
    } catch (error) {
      console.error('[ListingProcessor] Error finding existing listing:', error);
      return null;
    }
  }

  /**
   * Tìm listing đã tồn tại dựa trên Platform và ListingID (extracted from URL)
   */
  private async findExistingListing(productUrl: string, platformId: number): Promise<any> {
    try {
      // Get platform to get its PlatformID and PlatformLocale
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
      // IMPORTANT: Search across ALL locales to prevent duplicates
      console.log('[ListingProcessor] Searching for existing listing with Platform:', platformId, 'ListingID:', listingId);
      
      // Try different search approaches for Strapi 5
      // Force Vietnamese locale for Shopee Vietnam
      let listings: any = await this.strapi.entityService.findMany('api::listing.listing', {
        filters: {
          Platform: { id: platformId },
          ListingID: listingId  // Use Strapi field name (capital letters)
        },
        populate: '*' as any,
        locale: 'vi' // Force Vietnamese locale for Shopee Vietnam
      } as any);
      
      // Debug: Log raw query result
      console.log('[ListingProcessor] Query result type:', typeof listings, 'Is array:', Array.isArray(listings));
      
      // If not array or empty, try with 'all' locale to find any existing
      if (!listings || (Array.isArray(listings) && listings.length === 0)) {
        console.log('[ListingProcessor] First query returned no results, trying with all locales');
        listings = await this.strapi.entityService.findMany('api::listing.listing', {
          filters: {
            Platform: { id: platformId },
            ListingID: listingId
          },
          populate: '*' as any,
          locale: 'all' // Search all locales to find any duplicate
        } as any) as any;
        console.log('[ListingProcessor] Second query result:', listings ? listings.length : 'null');
      }

      // If still no results, try direct database query
      if (!listings || (Array.isArray(listings) && listings.length === 0)) {
        console.log('[ListingProcessor] API queries failed, trying direct database query');
        try {
          const knex = this.strapi.db.connection;
          const dbResults = await knex('listings')
            .where('listings.listing_id', listingId)  // Specify table name for listing_id
            .join('listings_platform_lnk', 'listings.id', 'listings_platform_lnk.listing_id')
            .where('listings_platform_lnk.platform_id', platformId)
            .select('listings.*');
          
          console.log('[ListingProcessor] Direct DB query found:', dbResults.length, 'listings');
          
          if (dbResults && dbResults.length > 0) {
            // Return first result as Strapi entity format
            return dbResults[0];
          }
        } catch (dbError) {
          console.error('[ListingProcessor] Database query error:', dbError);
        }
      }
      
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
      console.log('[ListingProcessor] Creating new Shopee Vietnam platform with locale: vi');
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
   * Find or create Item based on product data
   */
  private async findOrCreateItem(product: ShopeeProduct, category: any, locale: string = 'vi'): Promise<any> {
    try {
      // Extract brand from title if not already present
      // TODO: Extension should be updated to crawl brand field from Shopee
      if (!product.brand) {
        const title = product.title || (product as any).productName || '';
        // Try to extract brand from title
        if (title.toLowerCase().includes('samsung')) {
          product.brand = 'Samsung';
        } else if (title.toLowerCase().includes('apple') || title.toLowerCase().includes('iphone')) {
          product.brand = 'Apple';
        } else if (title.toLowerCase().includes('xiaomi')) {
          product.brand = 'Xiaomi';
        } else if (title.toLowerCase().includes('oppo')) {
          product.brand = 'Oppo';
        } else if (title.toLowerCase().includes('vivo')) {
          product.brand = 'Vivo';
        } else if (title.toLowerCase().includes('realme')) {
          product.brand = 'Realme';
        } else if (title.toLowerCase().includes('nokia')) {
          product.brand = 'Nokia';
        } else if (title.toLowerCase().includes('lg')) {
          product.brand = 'LG';
        } else if (title.toLowerCase().includes('sony')) {
          product.brand = 'Sony';
        } else if (title.toLowerCase().includes('dell')) {
          product.brand = 'Dell';
        } else if (title.toLowerCase().includes('hp')) {
          product.brand = 'HP';
        } else if (title.toLowerCase().includes('lenovo')) {
          product.brand = 'Lenovo';
        } else if (title.toLowerCase().includes('asus')) {
          product.brand = 'Asus';
        } else if (title.toLowerCase().includes('acer')) {
          product.brand = 'Acer';
        }

        if (product.brand) {
          console.log('[ListingProcessor] Extracted brand from title:', product.brand, 'Title:', title);
        }
      }

      // First, validate if Item should be created
      const validation = this.itemValidator.shouldCreateItem(product);

      if (!validation.valid) {
        console.log('[ListingProcessor] Skip Item creation:', validation.reason);
        console.log('[ListingProcessor] Product:', product.title, 'Brand:', product.brand);
        return null; // Don't create Item for generic products
      }
      
      // Extension sends 'productName', some places use 'title'
      const rawItemTitle = product.title || (product as any).productName || '';
      const itemTitle = this.fixVietnameseEncoding(rawItemTitle);
      
      // Generate MatchCode using TitleNormalizer (with category for better matching)
      const categoryName = category?.Title || product.category || 'item';
      const matchCode = this.titleNormalizer.generateMatchCode(itemTitle, product.brand, categoryName);
      const normalizedTitle = this.titleNormalizer.normalizeTitle(itemTitle, product.brand);
      
      console.log('[ListingProcessor] Finding Item with MatchCode:', matchCode);
      console.log('[ListingProcessor] Normalized title:', normalizedTitle);
      
      // 1. Try to find by MatchCode (primary matching) - check all locales
      // Use startsWith to match items with suffix too (e.g., samsung-galaxy-s25-ultra-123456)
      const existingByCode: any = await this.strapi.entityService.findMany('api::item.item', {
        filters: {
          MatchCode: {
            $startsWith: matchCode
          }
          // Remove locale filter to find item in any language
        }
        // Remove populate to avoid join issues
      });

      if (existingByCode && existingByCode.length > 0) {
        const existingItem = existingByCode[0];
        console.log('[ListingProcessor] Found existing Item by MatchCode:', existingItem.id, 'documentId:', existingItem.documentId);

        // IMPORTANT: Verify the item actually exists in DB (not just in cache)
        try {
          const verifiedItem = await this.strapi.entityService.findOne('api::item.item', existingItem.id);

          if (!verifiedItem) {
            console.log('[ListingProcessor] Item found in cache but not in DB (was deleted), will create new Item');
            // Item was deleted from DB but still in cache - skip to create new one
          } else {
            // Item exists - check if current locale version exists
            if (verifiedItem.locale === locale) {
              // Update existing locale version with latest data from listing
              console.log('[ListingProcessor] Updating existing Item with latest data from listing');
              return this.updateItemWithLatestData(verifiedItem, product, locale);
            } else {
              // Item exists but in different locale - check if current locale version exists
              const currentLocaleItem: any = await this.strapi.entityService.findMany('api::item.item', {
                filters: {
                  documentId: verifiedItem.documentId,
                  locale: locale
                }
              });

              if (currentLocaleItem && currentLocaleItem.length > 0) {
                // Current locale version already exists - update it with latest data
                console.log('[ListingProcessor] Found existing Item in current locale, updating with latest data:', currentLocaleItem[0].id);
                return this.updateItemWithLatestData(currentLocaleItem[0], product, locale);
              } else {
                // Create new locale version for existing item
                console.log('[ListingProcessor] Creating new locale version for existing Item');
                return this.createItemLocalization(verifiedItem, product, locale);
              }
            }
          }
        } catch (verifyError) {
          console.log('[ListingProcessor] Error verifying Item existence:', verifyError);
          // Continue to create new item
        }
      }
      
      // 2. Try fuzzy matching with similar normalized titles
      let similarItems: any[] = [];
      try {
        // Simplify query to avoid join issues
        if (category && category.id) {
          similarItems = await this.strapi.entityService.findMany('api::item.item', {
            filters: {
              Category: category.id
            },
            locale: locale,
            limit: 50 // Check top 50 items in same category
          });
        } else {
          // If no category, skip fuzzy matching to avoid loading too many items
          similarItems = [];
        }
      } catch (err) {
        console.log('[ListingProcessor] Error loading similar items:', err);
        similarItems = [];
      }
      
      for (const item of similarItems || []) {
        const similarity = this.titleNormalizer.calculateSimilarity(itemTitle, item.Title || '');
        if (similarity > 0.85) {
          console.log('[ListingProcessor] Found similar Item with', similarity * 100, '% similarity:', item.id);
          // Update MatchCode if not set
          if (!item.MatchCode) {
            await this.strapi.entityService.update('api::item.item', item.id, {
              data: {
                MatchCode: matchCode,
                NormalizedTitle: normalizedTitle
              },
              locale: locale
            });
          }
          return this.updateItemWithLatestData(item, product, locale);
        }
      }
      
      // No matching Item found - create new one
      console.log('[ListingProcessor] No matching Item found, creating new Item with MatchCode:', matchCode);

      // Check if MatchCode already exists in database (could be from a previous failed attempt)
      // Use startsWith to match items with suffix too
      const existingWithMatchCode: any = await this.strapi.entityService.findMany('api::item.item', {
        filters: {
          MatchCode: {
            $startsWith: matchCode
          }
        },
        locale: locale
      });

      if (existingWithMatchCode && existingWithMatchCode.length > 0) {
        console.log('[ListingProcessor] Found existing Item with same MatchCode, updating instead of creating');
        const existingItem = existingWithMatchCode[0];

        // Check if other locales exist
        const hasOtherLocales: any = await this.strapi.entityService.findMany('api::item.item', {
          filters: {
            documentId: existingItem.documentId,
            locale: { $ne: locale }
          }
        });

        const updatedItem = await this.updateItemWithLatestData(existingItem, product, locale);

        // Create other locale if not exists
        if (!hasOtherLocales || hasOtherLocales.length === 0) {
          const otherLocale = locale === 'vi' ? 'en' : 'vi';
          console.log('[ListingProcessor] Creating localization for locale:', otherLocale);
          await this.createItemLocalization(existingItem, product, otherLocale);
        }

        return updatedItem;
      }

      const descriptionBlocks = product.description ? [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: this.fixVietnameseEncoding(product.description)
            }
          ]
        }
      ] : [];

      // Extract core product name for display
      const coreProductName = this.titleNormalizer.extractCoreProductName(itemTitle, product.brand);
      let itemSlug = this.generateSlug(coreProductName);

      // Build platform identifiers
      const platformId = product.productUrl ? this.extractPlatformProductId(product.productUrl) : null;
      let platformIdentifiers = {};
      if (platformId) {
        const [platform, id] = platformId.split(':');
        platformIdentifiers = { [platform]: id };
      }

      // Get confidence score for this Item
      const confidence = this.itemValidator.getItemConfidence(product);

      // Ensure unique Slug and MatchCode to avoid constraints violation
      const timestamp = Date.now();
      const uniqueSuffix = `${timestamp}`.slice(-6); // Last 6 digits of timestamp
      itemSlug = `${itemSlug}-${uniqueSuffix}`;
      const uniqueMatchCode = `${matchCode}-${uniqueSuffix}`;

      console.log('[ListingProcessor] Creating Item with unique identifiers:', {
        originalSlug: this.generateSlug(coreProductName),
        uniqueSlug: itemSlug,
        originalMatchCode: matchCode,
        uniqueMatchCode: uniqueMatchCode
      });

      const newItem = await this.strapi.entityService.create('api::item.item', {
        data: {
          Title: coreProductName, // Clean title without marketing text
          Slug: itemSlug,
          MatchCode: uniqueMatchCode, // Unique matching code
          NormalizedTitle: normalizedTitle, // For similarity comparison
          MatchConfidence: confidence, // Confidence based on validation
          Description: descriptionBlocks,
          isActive: true,
          isFeatured: false,
          ItemType: 'Product',
          Price: product.price || 0,
          Currency: product.currency || 'VND',
          Score: product.rating || 0,
          Brand: product.brand ? this.titleNormalizer.normalizeBrand(product.brand) : null,
          ModelNumber: this.extractModelNumber(itemTitle),
          PlatformIdentifiers: platformIdentifiers,
          Category: category ? category.id : null,
          // Remove DynamicFields as it's not in schema
          publishedAt: new Date().toISOString()
        },
        locale: locale || 'vi' // IMPORTANT: Specify locale to create Item in correct language
      } as any);
      
      console.log('[ListingProcessor] Created new Item with ID:', newItem.id, 'documentId:', newItem.documentId, 'MatchCode:', uniqueMatchCode);

      // Create localizations for ALL enabled locales (not hardcoded)
      if (newItem.documentId) {
        try {
          // Get all enabled locales from i18n plugin
          const i18nService = this.strapi.plugin('i18n')?.service('locales');
          let allLocales = ['vi', 'en']; // Default fallback

          if (i18nService && typeof i18nService.find === 'function') {
            const localesData = await i18nService.find();
            allLocales = localesData.map((l: any) => l.code);
          }

          console.log('[ListingProcessor] Creating Item localizations for locales:', allLocales);

          // Create Item for each locale (except the one already created)
          for (const targetLocale of allLocales) {
            if (targetLocale === locale) continue; // Skip the locale we already created

            try {
              console.log('[ListingProcessor] Creating', targetLocale, 'localization for documentId:', newItem.documentId);

              // Find category for this locale if available
              let localizedCategory = null;
              if (category && category.documentId) {
                const linkedCategories = await this.strapi.entityService.findMany('api::category.category', {
                  filters: {
                    documentId: category.documentId,
                    locale: targetLocale
                  },
                  limit: 1
                });
                if (linkedCategories && linkedCategories.length > 0) {
                  localizedCategory = linkedCategories[0];
                }
              }

              const localizationData = {
                Title: coreProductName, // Keep same title for now (could translate later)
                Slug: itemSlug,
                MatchCode: uniqueMatchCode,
                NormalizedTitle: normalizedTitle,
                MatchConfidence: confidence,
                Description: descriptionBlocks,
                isActive: true,
                isFeatured: false,
                ItemType: 'Product',
                Price: product.price || 0,
                Currency: product.currency || 'VND',
                Score: product.rating || 0,
                Brand: product.brand ? this.titleNormalizer.normalizeBrand(product.brand) : null,
                ModelNumber: this.extractModelNumber(itemTitle),
                PlatformIdentifiers: platformIdentifiers,
                Category: localizedCategory ? localizedCategory.id : null,
                publishedAt: new Date().toISOString(),
                documentId: newItem.documentId // Use same documentId for localization
              };

              // Create localization with same documentId
              const localizedItem = await this.strapi.entityService.create('api::item.item', {
                data: localizationData,
                locale: targetLocale
              } as any);

              console.log('[ListingProcessor] Created', targetLocale, 'Item localization, ID:', localizedItem?.id);
            } catch (localeError: any) {
              console.log('[ListingProcessor] Could not create', targetLocale, 'Item localization:', localeError.message);
            }
          }
        } catch (error: any) {
          console.log('[ListingProcessor] Error creating Item localizations:', error.message);
        }
      }
      
      // Queue validation job for new Item
      try {
        const { addJob } = require('./bullmqQueue');
        if (addJob) {
          const validationJob = await addJob({
            items: [{
              itemId: newItem.id,
              title: coreProductName,
              description: product.description || '',
              price: product.price || 0,
              brand: product.brand || '',
              category: category?.Name || '',
              platform: 'shopee',
              url: product.url || product.productUrl || ''
            }],
            source: 'item_creation',
            priority: 'normal'
          });
          console.log('[ListingProcessor] Queued validation job for Item:', newItem.id, 'Job ID:', validationJob?.id);
        }
      } catch (queueError: any) {
        console.log('[ListingProcessor] Could not queue validation job:', queueError?.message || queueError);
        // Not critical - Item still created successfully
      }
      
      return newItem;
      
    } catch (error: any) {
      console.error('[ListingProcessor] Error finding/creating Item:', error);

      // Log detailed validation errors if available
      if (error.details && error.details.errors) {
        console.error('[ListingProcessor] Validation errors:', error.details.errors);
        error.details.errors.forEach((validationError: any, index: number) => {
          console.error(`[ListingProcessor] Validation error ${index + 1}:`, {
            field: validationError.path,
            message: validationError.message,
            value: validationError.value
          });
        });
      } else if (error.details) {
        console.error('[ListingProcessor] Error details:', error.details);
      } else if (error.message) {
        console.error('[ListingProcessor] Error message:', error.message);
      }

      return null;
    }
  }

  /**
   * Tạo listing mới từ Shopee data
   */
  private async createNewListing(data: ShopeeData, platformId: number): Promise<any> {
    try {
      const { product, seller, review } = data;
      
      // Get platform to get its PlatformID and PlatformLocale
      const platform = await this.strapi.entityService.findOne('api::platform.platform', platformId);
      if (!platform) {
        throw new Error(`Platform not found with ID: ${platformId}`);
      }
      
      // Use PlatformID field (required)
      const platformIdentifier = platform.PlatformID || platform.Slug;
      if (!platformIdentifier) {
        throw new Error(`Platform ${platform.Name || platformId} is missing PlatformID field`);
      }
      
      // Determine locale based on platform
      const platformLocale = platform.PlatformLocale;
      const countryCode = platform.Country;
      
      console.log('[ListingProcessor] Platform data:', {
        Name: platform.Name,
        PlatformLocale: platformLocale,
        Country: countryCode,
        PlatformID: platform.PlatformID,
        AllFields: Object.keys(platform)
      });
      
      // Force Vietnamese locale for Shopee Vietnam
      let locale = 'vi'; // Always use Vietnamese for Shopee Vietnam
      
      // Log locale determination
      console.log(`[ListingProcessor] Setting locale to 'vi' for Shopee Vietnam platform`);
      
      console.log('[ListingProcessor] DEBUG - Locale determination:', {
        platformLocale,
        countryCode,
        slug: platform.Slug,
        determinedLocale: locale
      });
      
      console.log('[ListingProcessor] FINAL locale set to:', locale, 'for platform:', platform.Name);
      
      // Extract IDs để tạo ListingID unique với format: platformIdentifier.uniqueId
      // Extension sends 'url' field, some places use 'productUrl'
      const productUrl = product.url || product.productUrl || '';
      const productId = this.extractProductId(productUrl);
      const shopId = this.extractShopId(productUrl);
      const uniqueId = productId && shopId ? `${shopId}_${productId}` : null;
      // Use ListingID from product data if provided (from UnifiedValidationService)
      let listingId = product.ListingID || (uniqueId ? `${platformIdentifier}.${uniqueId}` : null);
      if (product.ListingID) {
        console.log('[ListingProcessor] Using ListingID from UnifiedValidationService:', listingId);
      }
      
      // Find or create category based on product category with encoding fix
      const fixedCategory = this.fixVietnameseEncoding(product.category || '');
      const category = await this.findOrCreateCategory(fixedCategory, locale);
      
      // NOTE: We'll create/find Item AFTER creating the listing successfully
      // This prevents creating orphaned Items when listing creation fails
      let item = null;
      
      // Get product title first (for media upload)
      const rawTitle = product.title || (product as any).productName || '';
      const fixedTitle = this.fixVietnameseEncoding(rawTitle);

      // Upload product images to Media Library
      console.log('[ListingProcessor] Uploading product images:', fixedTitle);
      console.log('[ListingProcessor] Product images array:', product.images);
      console.log('[ListingProcessor] Images count:', product.images ? product.images.length : 0);

      // Upload images and get media IDs
      const mediaIds = await uploadProductImages(
        strapi,
        product.images || [],
        fixedTitle || 'Product',
        [], // No existing media
        listingId === null ? undefined : listingId
      );
      console.log('[ListingProcessor] Uploaded media IDs:', mediaIds);

      // Also process external images for ExternalImages field
      const imageResult = await this.processExternalImages(product.images || []);
      console.log('[ListingProcessor] External images processed:', imageResult.urls.length, 'URLs');
      
      // Convert description to Blocks format for Strapi with encoding fix
      const fixedDescription = this.fixVietnameseEncoding(product.description || '');
      const descriptionBlocks = fixedDescription ? [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: fixedDescription
            }
          ]
        }
      ] : [];

      // Validate title exists (already processed above)
      if (!rawTitle || rawTitle.trim() === '') {
        console.error('[ListingProcessor] Missing product title, cannot create listing');
        console.error('[ListingProcessor] Product data:', JSON.stringify(product, null, 2));
        throw new Error('Product title is required to create listing');
      }
      
      // Get URL from either field (extension sends 'url', some places use 'productUrl')
      let rawUrl = product.url || product.productUrl || '';
      
      // Fix common URL format issues
      // Fix wrong domain format: https://shopee/vn -> https://shopee.vn
      if (rawUrl.includes('shopee/vn')) {
        rawUrl = rawUrl.replace('shopee/vn', 'shopee.vn');
        console.log('[ListingProcessor] Fixed URL domain format:', rawUrl);
      }
      
      // Format proper Shopee product URL
      let formattedUrl = rawUrl;
      
      // Convert from extension format: https://shopee.vn/i.{shopId}.{productId}
      // To standard format: https://shopee.vn/product/{shopId}/{productId}
      if (rawUrl.includes('shopee.vn/i.')) {
        const match = rawUrl.match(/shopee\.vn\/i\.(\d+)\.(\d+)/);
        if (match && match[1] && match[2]) {
          formattedUrl = `https://shopee.vn/product/${match[1]}/${match[2]}`;
          console.log('[ListingProcessor] Formatted Shopee URL from:', rawUrl, 'to:', formattedUrl);
        }
      }
      
      // Also handle if URL already has /product/ but wrong format (with dot instead of slash)
      // e.g., https://shopee.vn/product/65589552.26423481860 -> https://shopee.vn/product/65589552/26423481860
      if (formattedUrl.includes('shopee.vn/product/') && !formattedUrl.match(/\/product\/\d+\/\d+/)) {
        // Replace the dot between shop ID and product ID with a slash
        formattedUrl = formattedUrl.replace(/\/product\/(\d+)\.(\d+)/, '/product/$1/$2');
        console.log('[ListingProcessor] Fixed product URL format:', formattedUrl);
      }
      
      // Chuẩn bị listing data với tất cả fields mới
      const listingData: any = {
        // Let Strapi 5 auto-generate document_id by not including it
        Title: fixedTitle,
        Slug: this.generateSlug(fixedTitle),
        URL: formattedUrl || '',
        Description: descriptionBlocks, // Use Blocks format
        IsActive: true,
        ListingStatus: 'Pending', // Set Pending để review - use correct field name with capital P
        ReviewNotes: `Nhập từ Shopee. Giá: ${product.price?.toLocaleString('vi-VN')} ${product.currency}. Người bán: ${seller ? this.toTitleCase(this.fixVietnameseEncoding(seller.name || '')) : 'N/A'}`,
        ListingID: listingId, // ID unique từ platform - use Strapi field name
        Platform: platformId, // Relation tới Platform
        Item: null, // Will be linked after listing is created successfully
        publishedAt: new Date().toISOString(), // Auto-publish the listing
        // KHÔNG thêm locale vào data - locale phải ở trong params của entityService.create
        
        // Generic fields - data chung cho mọi platform
        Price: product.price || 0,
        OriginalPrice: product.originalPrice || product.price || 0, // Use originalPrice if available
        Currency: product.currency || 'VND',
        PriceUnit: 'Item', // Default là per Item (capital I), có thể là 'Hour', 'Day', 'Month'
        AverageRating: product.rating || 0, // Rating from Shopee
        TotalReviews: product.productReviewCount || 0, // Use actual product review count (not seller's total)
        SoldCount: product.soldCount || 0, // Map to sold_count field from Shopee
        UsageCount: product.soldCount || 0, // UsageCount = SoldCount (Đã bán)
        Stock: product.stock || 0,
        PlatformOwnerID: shopId || '', // Shop ID là owner ID cho Shopee
        PlatformOwnerName: seller ? this.toTitleCase(this.fixVietnameseEncoding(seller.name || '')) : 'N/A', // Fix encoding and normalize to Title Case
        Brand: this.extractBrandFromProductData(product), // Extract brand from product data or title
        Location: this.fixVietnameseEncoding(product.shipFrom || ''), // Fix encoding for location
        LastUpdated: new Date().toISOString(), // Add LastUpdated timestamp
        FavoriteCount: product.likedCount || 0, // Map likedCount from Shopee (Đã thích)
        ViewCount: 0, // Initialize ViewCount
        
        // Relations
        Category: category ? category.id : null, // Link to category if found (use ID directly)
        Media: mediaIds && mediaIds.length > 0 ? mediaIds : [], // Set uploaded media IDs
        ExternalImages: imageResult.urls, // Store external URLs
        
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
            brand: product.brand || null,
            stock: product.stock,
            shipFrom: product.shipFrom,
            rating: product.rating,
            soldCount: product.soldCount,
            likedCount: product.likedCount,
            images: product.images || [],
            variants: product.variants || []
          },
          seller: seller ? {
            name: this.fixVietnameseEncoding(seller.name || ''),
            rating: seller.rating,
            responseRate: seller.responseRate,
            responseTime: seller.responseTime,
            joinSince: seller.joinSince,
            productCount: seller.productCount,
            followerCount: seller.followerCount,
            reviewCount: seller.reviewCount
          } : null,
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
      console.log('[ListingProcessor] Creating listing with locale:', locale);
      console.log('[ListingProcessor] Full listing data:', JSON.stringify({
        Title: listingData.Title,
        ListingID: listingData.ListingID,
        Platform: listingData.Platform,
        locale: locale, // This is passed in params, not data
        Price: listingData.Price,
        Currency: listingData.Currency
      }, null, 2));
      
      // Log final data before creating
      console.log('[ListingProcessor] Creating listing with data:', {
        Title: listingData.Title,
        locale: locale, // This will be in params
        Platform: listingData.Platform,
        ListingID: listingData.ListingID,
        Category: listingData.Category,
        UsageCount: listingData.UsageCount
      });
      
      // Tạo listing - IMPORTANT: Strapi 5 needs locale in params, not in data
      // Only create in Vietnamese locale to prevent duplicate English entries
      // Handle race condition with try-catch for duplicate key error
      let newListing;
      try {
        // Don't destructure locale from listingData since it doesn't exist there
        // listingData already contains all the fields without locale
        
        newListing = await this.strapi.entityService.create('api::listing.listing', {
          data: listingData, // Don't include locale in data
          populate: ['Media', 'Platform', 'Category'], // Populate relations to verify
          locale: locale // Set locale in params for Strapi 5
        } as any);

        console.log('[ListingProcessor] Created Vietnamese listing with ID:', newListing.id, 'DocumentId:', newListing.documentId);
        
        // Create English translation for the listing
        // In Strapi 5, we need to create the English version separately
        try {
          console.log('[ListingProcessor] Creating English translation for listing');

          // Find English category using smart matching
          let englishCategoryId = null;
          if (category) {
            // Try to find English category with same documentId (linked translations)
            if (category.documentId) {
              const linkedEnCategory = await this.strapi.entityService.findMany('api::category.category', {
                filters: {
                  documentId: category.documentId,
                  locale: 'en'
                },
                limit: 1
              });

              if (linkedEnCategory && linkedEnCategory.length > 0) {
                englishCategoryId = linkedEnCategory[0].id;
                console.log('[ListingProcessor] Found linked English category:', linkedEnCategory[0].Name);
              }
            }

            // No fallback - categories must be properly linked via documentId
            // This ensures data integrity and proper i18n structure
            if (!englishCategoryId) {
              console.log(`[ListingProcessor] Warning: No English translation for category "${category.Name}" (ID: ${category.id}, documentId: ${category.documentId})`);
              console.log(`[ListingProcessor] English listing will be created without category. Please create English category translation in admin panel.`);
            }
          }

          // Create English version using Strapi 5's proper i18n approach
          // The key is to use the i18n service's createLocalization method
          const documentId = newListing.documentId;
          console.log('[ListingProcessor] Creating English listing with same documentId:', documentId);

          try {
            // Check if i18n plugin is available and has the service we need
            const i18nPlugin = this.strapi.plugin('i18n');
            if (i18nPlugin && i18nPlugin.service) {
              const coreApiService = i18nPlugin.service('core-api');

              if (coreApiService && typeof coreApiService.createLocalization === 'function') {
                // Use the official i18n createLocalization method
                const englishListing = await coreApiService.createLocalization({
                  id: newListing.id,
                  locale: 'en',
                  data: {
                    ...listingData,
                    Category: englishCategoryId, // Use English category or null (don't fallback to Vietnamese)
                    Title: listingData.Title // Keep same title for now
                  }
                }, 'api::listing.listing');

                console.log('[ListingProcessor] Created English listing using i18n service, ID:', englishListing?.id);
              } else {
                // Fallback: Create English listing manually with same documentId
                console.log('[ListingProcessor] i18n service not available, creating English listing manually');

                // First check if English version already exists (race condition)
                const existingEnglish: any = await this.strapi.entityService.findMany('api::listing.listing', {
                  filters: {
                    documentId: documentId,
                    locale: 'en'
                  },
                  limit: 1
                } as any);

                if (!existingEnglish || existingEnglish.length === 0) {
                  // Prepare English listing data
                  const englishListingData = {
                    ...listingData,
                    Category: englishCategoryId, // Use English category or null (don't fallback to Vietnamese)
                    Title: listingData.Title,
                    // IMPORTANT: Include documentId to link with Vietnamese version
                    documentId: documentId
                  };

                  // Create English listing
                  const englishListing = await this.strapi.entityService.create('api::listing.listing', {
                    data: englishListingData,
                    locale: 'en',
                    populate: ['Category', 'Platform']
                  } as any);

                  console.log('[ListingProcessor] Created English listing manually with ID:', englishListing?.id);
                } else {
                  console.log('[ListingProcessor] English listing already exists for this documentId');
                }
              }
            } else {
              console.log('[ListingProcessor] i18n plugin not available');
            }
          } catch (enCreateError: any) {
            console.log('[ListingProcessor] Error creating English listing:', enCreateError.message);

            // If error is about duplicate documentId, try updating the locale directly in DB
            if (enCreateError.message?.includes('duplicate') || enCreateError.message?.includes('unique')) {
              console.log('[ListingProcessor] Attempting direct DB update for English locale...');
              try {
                // This is a last resort - directly insert English locale record
                const knex = this.strapi.db.connection;

                // Check if the listings table has the proper structure
                const englishRecord = {
                  ...listingData,
                  document_id: documentId,
                  locale: 'en',
                  created_at: new Date(),
                  updated_at: new Date(),
                  published_at: new Date(),
                  created_by_id: 1,
                  updated_by_id: 1
                };

                // Remove fields that might cause issues
                delete englishRecord.documentId;
                delete englishRecord.Category;
                delete englishRecord.Platform;
                delete englishRecord.Item;

                const [insertedId] = await knex('listings').insert(englishRecord).returning('id');

                // Now add the relations
                if (listingData.Platform) {
                  await knex('listings_platform_lnk').insert({
                    listing_id: insertedId,
                    platform_id: listingData.Platform
                  });
                }

                if (englishCategoryId || listingData.Category) {
                  await knex('listings_category_lnk').insert({
                    listing_id: insertedId,
                    category_id: englishCategoryId || listingData.Category
                  });
                }

                console.log('[ListingProcessor] Created English listing via direct DB insert, ID:', insertedId);
              } catch (dbError: any) {
                console.log('[ListingProcessor] Direct DB insert also failed:', dbError.message);
              }
            }
          }
        } catch (enError: any) {
          console.log('[ListingProcessor] Could not create English translation:', enError.message);
          // Not critical - listing still created in Vietnamese
        }
        
        // Now find or create Item AFTER listing is successfully created
        // Create Item for Vietnamese locale  
        item = await this.findOrCreateItem(product, category, 'vi');
        
        // Also create English Item (re-enabled)
        let englishItem = null;
        try {
          // Prefer finding English category via linked documentId
          let englishCategoryForItem = null as any;
          if (category) {
            if (category.documentId) {
              const linkedEn = await (this.strapi.entityService as any).findMany('api::category.category', {
                filters: { documentId: { $eq: category.documentId } },
                locale: 'en',
                limit: 1
              });
              if (linkedEn && linkedEn.length > 0) {
                englishCategoryForItem = linkedEn[0];
              }
            }
            // Fallback by fuzzy matching on Slug/Name when no direct link
            if (!englishCategoryForItem) {
              const allEnCategories = await this.strapi.entityService.findMany('api::category.category', {
                filters: { locale: 'en' },
                limit: 100
              });
              if (allEnCategories && allEnCategories.length > 0) {
                let best = null as any;
                let score = 0;
                const viSlug = (category.Slug || category.Name || '').toString().toLowerCase();
                for (const enCat of allEnCategories) {
                  const enSlug = (enCat.Slug || enCat.Name || '').toString().toLowerCase();
                  const s = this.calculateSimilarity(viSlug, enSlug);
                  if (s > score) { score = s; best = enCat; }
                }
                if (best && score >= 0.5) {
                  englishCategoryForItem = best;
                }
              }
            }
          }
          englishItem = await this.findOrCreateItem(product, englishCategoryForItem, 'en');
        } catch (enItemError: any) {
          console.log('[ListingProcessor] Could not create English Item:', enItemError.message);
        }
        
        // Update listing to link with Item if found/created
        if (item) {
          newListing = await this.strapi.entityService.update('api::listing.listing', newListing.id, {
            data: {
              Item: item.id,
              // Keep existing Title to avoid validation error
              Title: newListing.Title || fixedTitle
            },
            locale: 'vi' // Add locale back for Strapi 5 compatibility
          } as any);
          console.log('[ListingProcessor] Linked listing with Item ID:', item.id);
        }
        
        // Update English listing with English Item if available
        if (englishItem) {
          try {
            const englishListings: any = await this.strapi.entityService.findMany('api::listing.listing', {
              filters: {
                ListingID: listingId || ''
              },
              locale: 'en',
              limit: 1
            } as any);
            if (englishListings && englishListings.length > 0) {
              await this.strapi.entityService.update('api::listing.listing', englishListings[0].id, {
                data: {
                  Item: englishItem.id,
                  Title: englishListings[0].Title
                },
                locale: 'en'
              } as any);
              console.log('[ListingProcessor] Linked English listing with English Item ID:', englishItem.id);
            }
          } catch (linkError: any) {
            console.log('[ListingProcessor] Could not link English Item:', linkError.message);
          }
        }
      } catch (error: any) {
        // Log full error for debugging
        console.log('[ListingProcessor] Error creating listing:', {
          code: error.code,
          message: error.message,
          details: error.details,
          name: error.name
        });
        
        // Check if it's a duplicate key error (PostgreSQL error code 23505)
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
          console.log('[ListingProcessor] Duplicate listing detected, trying to find existing one...');
          
          // Wait a bit for the transaction to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Re-fetch the existing listing that was created by another parallel process
          const platformId = typeof platform.id === 'string' ? parseInt(platform.id) : platform.id;
          const existing = await this.findExistingListing(product.productUrl || '', platformId);
          if (existing) {
            console.log('[ListingProcessor] Found existing listing created by parallel process, ID:', existing.id);
            
            // Find or create Item for this existing listing
            item = await this.findOrCreateItem(product, category, locale);
            
            // Update the existing listing with new data and link Item
            const updatedListing = await this.strapi.entityService.update('api::listing.listing', existing.id, {
              data: {
                UsageCount: product.soldCount || existing.UsageCount || 0,
                LastUpdated: new Date().toISOString(),
                Stock: product.stock || existing.Stock || 0,
                AverageRating: product.rating || existing.AverageRating || 0,
                TotalReviews: product.productReviewCount || existing.TotalReviews || 0,
                FavoriteCount: product.likedCount || existing.FavoriteCount || 0,
                Item: item ? item.id : existing.Item
                // External images handled in main flow, not here
              }
              // locale: 'vi' // TEMPORARILY COMMENTED
            } as any);
            
            console.log('[ListingProcessor] Updated existing listing with latest data');
            if (item) {
              console.log('[ListingProcessor] Linked listing with Item ID:', item.id);
            }
            return updatedListing;
          } else {
            // If still can't find, log the details for debugging
            console.error('[ListingProcessor] Could not find existing listing after duplicate key error');
            console.error('[ListingProcessor] ListingID:', listingId);
            console.error('[ListingProcessor] Platform:', platformId);
            // Return null to indicate failure
            return null;
          }
        }
        // Re-throw if it's not a duplicate error
        throw error;
      }

      // KHÔNG tạo review từ Shopee data
      // Reviews sẽ được người dùng tự thêm hoặc import riêng
      
      return newListing;
      
    } catch (error) {
      console.error('[ListingProcessor] Error creating new listing:', error);
      throw error;
    }
  }

  /**
   * Fix encoding issues with Vietnamese characters
   */
  private fixVietnameseEncoding(text: string): string {
    if (!text) return text;
    
    let fixed = text;
    
    // Fix specific encoding issues we're seeing
    // Common case issues with Vietnamese text
    // "ĐIệN ThoạI" should be "Điện thoại"
    fixed = fixed.replace(/ĐI[ệẸ]N\s*Tho[ạẠ]I/g, 'Điện thoại');
    fixed = fixed.replace(/Đi[ệẸ]n\s*tho[ạẠ]i/g, 'Điện thoại');
    fixed = fixed.replace(/ĐIỆN\s*THOẠI/g, 'Điện thoại');
    
    // Check if text contains encoding issues (� or question marks in unusual places)
    if (fixed.includes('�') || /\?[a-z]/.test(fixed)) {
      // Common Vietnamese character replacements
      const replacements: { [key: string]: string } = {
        '\\?i': 'Đi',
        '\\?a': 'đa', 
        '\\?o': 'đo',
        '\\?u': 'đu'
      };
      
      for (const [bad, good] of Object.entries(replacements)) {
        fixed = fixed.replace(new RegExp(bad, 'g'), good);
      }
      
      // If still has issues, try to decode from common encodings
      try {
        // Try to detect if it's incorrectly encoded Latin-1 or Windows-1252
        if (fixed.includes('�') || fixed.includes('?')) {
          // Log warning about encoding issue
          console.log('[ListingProcessor] WARNING: Encoding issue detected in text:', text.substring(0, 50) + '...');
        }
      } catch (e) {
        // Keep original if decoding fails
      }
    }
    
    // Normalize Vietnamese text properly
    // Only fix casing for known product category prefixes
    const productPrefixes = [
      { pattern: /^\[?livestream\]?\s*/i, replacement: '[Livestream] ' },
      { pattern: /^điện thoại\s+/i, replacement: 'Điện Thoại ' },
      { pattern: /^máy tính\s+/i, replacement: 'Máy Tính ' },
      { pattern: /^laptop\s+/i, replacement: 'Laptop ' },
      { pattern: /^tai nghe\s+/i, replacement: 'Tai Nghe ' },
      { pattern: /^phụ kiện\s+/i, replacement: 'Phụ Kiện ' }
    ];
    
    for (const { pattern, replacement } of productPrefixes) {
      if (pattern.test(fixed)) {
        fixed = fixed.replace(pattern, replacement);
        break; // Only apply first matching prefix
      }
    }
    
    return fixed.trim();
  }

  /**
   * Tạo slug từ title
   */
  private generateSlug(title: string): string {
    // Vietnamese character map for slug generation
    const vietnameseMap: { [key: string]: string } = {
      'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
      'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
      'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
      'đ': 'd',
      'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
      'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
      'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
      'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
      'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
      'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
      'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
      'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
      'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y'
    };
    
    // Convert Vietnamese characters to ASCII
    let slug = title.toLowerCase();
    
    // Replace Vietnamese characters
    for (const [vietnamese, ascii] of Object.entries(vietnameseMap)) {
      slug = slug.replace(new RegExp(vietnamese, 'g'), ascii);
    }
    
    // Handle uppercase Đ separately
    slug = slug.replace(/Đ/g, 'd');
    
    // Remove non-alphanumeric characters and convert to slug format
    return slug
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
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
   * Parse number from text like "1,068k" or "1.2k" or "1,234"
   */
  private parseNumberFromText(text: string | number): number {
    if (typeof text === 'number') return text;
    if (!text) return 0;
    
    const str = String(text).trim();
    
    // Handle "k" suffix (e.g., "1.2k" = 1200)
    if (str.toLowerCase().endsWith('k')) {
      const numStr = str.slice(0, -1).replace(/,/g, '.');
      return Math.round(parseFloat(numStr) * 1000);
    }
    
    // Handle "m" suffix (e.g., "1.5m" = 1500000)
    if (str.toLowerCase().endsWith('m')) {
      const numStr = str.slice(0, -1).replace(/,/g, '.');
      return Math.round(parseFloat(numStr) * 1000000);
    }
    
    // Remove all non-numeric characters except dots
    const cleanStr = str.replace(/[^\d.]/g, '');
    return parseInt(cleanStr) || 0;
  }

  /**
   * Find or create category based on Shopee category string
   */
  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // Contains check (one contains the other)
    if (s1.includes(s2) || s2.includes(s1)) {
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      return shorter.length / longer.length * 0.9; // 90% max for contains
    }
    
    // Levenshtein distance for fuzzy matching
    const matrix: number[][] = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1.0 : (maxLength - distance) / maxLength;
  }

  /**
   * Normalize category name for better matching
   */
  private normalizeCategoryName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[&]/g, 'và')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async findOrCreateCategory(categoryString: string, locale: string = 'vi'): Promise<any> {
    try {
      if (!categoryString) return null;
      
      // Parse category format: "Platform > Category 1 > Category 2 > Brand"
      const categories = categoryString.split('>').map(c => c.trim()).filter(c => c && !['Shopee', 'Lazada', 'Tiki'].includes(c));
      
      console.log('[ListingProcessor] Parsing category:', categoryString, 'Categories:', categories, 'Locale:', locale);
      
      // Get all existing categories from database
      const existingCategories = await this.strapi.entityService.findMany('api::category.category', {
        filters: {
          locale: locale
        },
        limit: 100 // Get all categories
      });
      
      if (!existingCategories || existingCategories.length === 0) {
        console.log('[ListingProcessor] No categories found in database for locale:', locale);
        return null;
      }
      
      // Find best matching category using similarity algorithm
      let bestMatch = null;
      let bestScore = 0;
      
      for (const platformCategory of categories) {
        const normalizedPlatformCat = this.normalizeCategoryName(platformCategory);
        
        for (const dbCategory of existingCategories) {
          const normalizedDbCat = this.normalizeCategoryName(dbCategory.Name || '');
          const similarity = this.calculateSimilarity(normalizedPlatformCat, normalizedDbCat);
          
          // Also check slug similarity
          const slugSimilarity = this.calculateSimilarity(
            this.generateSlug(platformCategory),
            dbCategory.Slug || ''
          );
          
          // Take the higher score
          const finalScore = Math.max(similarity, slugSimilarity * 0.8); // Slug similarity weighted lower
          
          if (finalScore > bestScore) {
            bestScore = finalScore;
            bestMatch = dbCategory;
          }
        }
      }
      
      // Only accept match if similarity is above threshold (60%)
      if (bestMatch && bestScore >= 0.6) {
        console.log(`[ListingProcessor] Found category match: "${bestMatch.Name}" with score: ${(bestScore * 100).toFixed(1)}%`);
        return bestMatch;
      }
      
      // Fallback: Try exact keyword matching as last resort
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
      
      // Find existing category by slug WITH CORRECT LOCALE
      const foundCategories = await this.strapi.entityService.findMany('api::category.category', {
        filters: {
          Slug: matchedCategory.slug,
          locale: locale // Filter by Vietnamese locale
        }
      });
      
      if (foundCategories && foundCategories.length > 0) {
        console.log('[ListingProcessor] Found existing category:', foundCategories[0].Name, 'with locale:', locale);
        return foundCategories[0];
      }
      
      // Category not found - DO NOT create new, let admin manage categories
      console.log('[ListingProcessor] WARNING: Category not found for:', matchedCategory.name, 'with locale:', locale);
      console.log('[ListingProcessor] Admin should create category with Name:', matchedCategory.name, 'Slug:', matchedCategory.slug, 'Locale:', locale);
      
      // Return null - listing will be created without category
      // Admin can assign category later
      return null;
      
    } catch (error) {
      console.error('[ListingProcessor] Error finding/creating category:', error);
      return null;
    }
  }

  /**
   * Process external images for Shopee/Lazada/Tiki products
   * Store URLs directly without downloading
   */
  private async processExternalImages(imageUrls: string[]): Promise<{ urls: string[], mediaIds: number[] }> {
    try {
      if (!imageUrls || imageUrls.length === 0) {
        console.log('[ListingProcessor] No images to process');
        return { urls: [], mediaIds: [] };
      }

      // Filter valid URLs and limit to 10 images
      const validUrls = imageUrls
        .filter(url => url && url.startsWith('http'))
        .slice(0, 10);

      console.log(`[ListingProcessor] Processing ${validUrls.length} external image URLs`);

      return {
        urls: validUrls,
        mediaIds: [] // No local media IDs when using external URLs
      };
    } catch (error) {
      console.error('[ListingProcessor] Error processing external images:', error);
      return { urls: [], mediaIds: [] };
    }
  }

  /**
   * Upload product images to Strapi Media Library using internal upload service
   * Supports: http/https URLs, // protocol-relative URLs, data:image base64
   * NOTE: Only used for manual uploads from Rate platform, not for external platforms
   */
  private async uploadProductImages(imageUrls: string[], productTitle: string, existingMediaIds?: number[], listingId?: string): Promise<number[]> {
    // Import the new upload function (use dynamic import for TypeScript)
    try {
      const module = await import('./uploadProductImages');
      return module.uploadProductImages(this.strapi, imageUrls, productTitle, existingMediaIds, listingId);
    } catch (error) {
      console.error('[ListingProcessor] Error importing uploadProductImages module:', error);
      // Fallback to empty array if module not found
      return [];
    }
  }
  
  /**
   * OLD - Upload product images to Strapi Media Library 
   * TODO: Remove after testing
   */
  /* COMMENTED OUT - OLD CODE
  private async uploadProductImagesOLD(imageUrls: string[], productTitle: string): Promise<number[]> {
    try {
      if (!imageUrls || imageUrls.length === 0) {
        console.log('[ListingProcessor] No images to upload');
        return [];
      }
      
      // Ensure strapi instance is available
      if (!this.strapi) {
        console.error('[ListingProcessor] Strapi instance not available in uploadProductImages');
        return [];
      }
      
      const mediaIds: number[] = [];
      const maxImages = Math.min(imageUrls.length, 5); // Limit to 5 images
      console.log(`[ListingProcessor] Attempting to upload ${maxImages} images`);
      
      // Import crypto for MD5 hash
      const crypto = require('crypto');
      
      // First, find or create the Items folder
      let itemsFolderId = null;
      try {
        // Check if Items folder exists
        const folders = await this.strapi.entityService.findMany('plugin::upload.folder', {
          filters: { name: 'Items' },
          limit: 1
        });
        
        if (folders && folders.length > 0) {
          itemsFolderId = folders[0].id;
          console.log('[ListingProcessor] Found existing Items folder with ID:', itemsFolderId);
        } else {
          // Create Items folder if it doesn't exist
          const newFolder = await this.strapi.entityService.create('plugin::upload.folder', {
            data: {
              name: 'Items',
              path: '/1', // Root level folder path
              pathId: 1 // Root folder ID
            }
          });
          itemsFolderId = newFolder.id;
          console.log('[ListingProcessor] Created new Items folder with ID:', itemsFolderId);
        }
      } catch (folderError) {
        console.log('[ListingProcessor] Could not find/create Items folder, uploading to root:', folderError);
      }
      
      for (let i = 0; i < maxImages; i++) {
        try {
          const imageUrl = imageUrls[i];
          if (!imageUrl) {
            console.log(`[ListingProcessor] Skipping empty URL at index ${i}`);
            continue;
          }
          
          console.log(`[ListingProcessor] Processing image ${i + 1}/${maxImages}: ${imageUrl.substring(0, 100)}${imageUrl.length > 100 ? '...' : ''}`);
          
          let buffer: Buffer;
          let mimeType = 'image/jpeg'; // Default mime type
          let extension = 'jpg'; // Default extension
          let originalUrl = imageUrl;
          
          // Handle different image formats
          if (imageUrl.startsWith('data:')) {
            // Handle base64 data URLs
            console.log(`[ListingProcessor] Detected base64 data URL`);
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!matches) {
              console.error(`[ListingProcessor] Invalid base64 format for image ${i + 1}`);
              continue;
            }
            mimeType = matches[1];
            const base64Data = matches[2];
            buffer = Buffer.from(base64Data, 'base64');
            
            // Determine extension from mime type
            if (mimeType.includes('png')) extension = 'png';
            else if (mimeType.includes('gif')) extension = 'gif';
            else if (mimeType.includes('webp')) extension = 'webp';
            else extension = 'jpg';
            
          } else if (imageUrl.startsWith('//')) {
            // Handle protocol-relative URLs
            originalUrl = `https:${imageUrl}`;
            console.log(`[ListingProcessor] Converted protocol-relative URL to: ${originalUrl}`);
            
            // Fetch image
            const response = await fetch(originalUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (!response.ok) {
              console.error(`[ListingProcessor] Failed to download image ${i + 1}: HTTP ${response.status}`);
              continue;
            }
            
            buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type');
            if (contentType) {
              mimeType = contentType.split(';')[0];
              if (mimeType.includes('png')) extension = 'png';
              else if (mimeType.includes('gif')) extension = 'gif';
              else if (mimeType.includes('webp')) extension = 'webp';
            }
            
          } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            // Handle regular HTTP/HTTPS URLs
            console.log(`[ListingProcessor] Fetching HTTP/HTTPS URL`);
            
            const response = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            
            if (!response.ok) {
              console.error(`[ListingProcessor] Failed to download image ${i + 1}: HTTP ${response.status}`);
              continue;
            }
            
            buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type');
            if (contentType) {
              mimeType = contentType.split(';')[0];
              if (mimeType.includes('png')) extension = 'png';
              else if (mimeType.includes('gif')) extension = 'gif';
              else if (mimeType.includes('webp')) extension = 'webp';
            }
            
          } else {
            console.log(`[ListingProcessor] Unsupported image format at index ${i}: ${imageUrl.substring(0, 50)}`);
            continue;
          }
          
          // Generate unique filename with MD5 hash
          const timestamp = Date.now();
          const slug = this.generateSlug(productTitle || 'product');
          const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
          const fileName = `shopee-${slug}-${timestamp}-${hash}.${extension}`;
          
          console.log(`[ListingProcessor] Uploading ${fileName} (${buffer.length} bytes, ${mimeType})`);
          
          try {
            // Verify temp file exists
            if (!fs.existsSync(tempFilePath)) {
              console.error(`[ListingProcessor] Temp file does not exist: ${tempFilePath}`);
              continue;
            }
            
            // Get file stats
            const stats = fs.statSync(tempFilePath);
            console.log(`[ListingProcessor] Temp file size: ${stats.size} bytes`);
            
            // Create FormData for upload
            const form = new FormData();
            
            // Add file to form
            form.append('files', fs.createReadStream(tempFilePath), {
              filename: fileName,
              contentType: 'image/jpeg'
            });
            
            // If we have a folder ID, add it
            if (itemsFolderId) {
              form.append('folder', itemsFolderId.toString());
            }
            
            console.log(`[ListingProcessor] Uploading via REST API to folder ${itemsFolderId || 'root'}`);
            
            // Upload via direct file creation
            let uploadedFiles: any[] = [];
            try {
              // Read file as buffer
              const fileBuffer = fs.readFileSync(tempFilePath);
              const fileStats = fs.statSync(tempFilePath);
              
              // Create file entry directly in database
              const fileData = {
                name: fileName,
                alternativeText: productTitle || 'Product image',
                caption: `${productTitle} - Image ${i + 1}`,
                width: null,
                height: null,
                formats: null,
                hash: `${fileName.replace(/\.[^/.]+$/, '')}_${Date.now()}`,
                ext: '.jpg',
                mime: 'image/jpeg',
                size: (fileStats.size / 1024).toFixed(2), // Size in KB
                url: `/uploads/${fileName}`,
                previewUrl: null,
                provider: 'local',
                provider_metadata: null,
                folder: itemsFolderId,
                folderPath: itemsFolderId ? '/1' : '/',
                createdBy: null,
                updatedBy: null
              };
              
              // Create the file entry in database
              const uploadedFile = await this.strapi.entityService.create('plugin::upload.file', {
                data: fileData
              });
              
              // Copy file to uploads directory
              const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
              if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
              }
              
              const targetPath = path.join(uploadsDir, fileName);
              fs.copyFileSync(tempFilePath, targetPath);
              console.log(`[ListingProcessor] Copied file to: ${targetPath}`);
              
              if (uploadedFile && uploadedFile.id) {
                uploadedFiles = [uploadedFile];
                console.log(`[ListingProcessor] ✅ Created file entry with ID: ${uploadedFile.id}`);
              } else {
                uploadedFiles = [];
              }
              
            } catch (uploadError) {
              console.error(`[ListingProcessor] Failed to create file entry:`, uploadError);
              uploadedFiles = [];
            }
            
            // Clean up temp file
            if (tempFilePath) {
              try {
                fs.unlinkSync(tempFilePath);
                console.log(`[ListingProcessor] Cleaned up temp file: ${tempFilePath}`);
                tempFilePath = undefined;
              } catch (e) {
                console.log(`[ListingProcessor] Could not delete temp file: ${tempFilePath}`);
              }
            }
            
            // Check upload result
            if (uploadedFiles && uploadedFiles.length > 0) {
              const uploadedFile = uploadedFiles[0];
              
              if (uploadedFile && uploadedFile.id) {
                mediaIds.push(uploadedFile.id);
                console.log(`[ListingProcessor] ✅ Successfully uploaded image ${i + 1}, ID: ${uploadedFile.id}, URL: ${uploadedFile.url}`);
              } else {
                console.log(`[ListingProcessor] ⚠️ Upload returned unexpected format:`, uploadedFile);
              }
            } else {
              console.log(`[ListingProcessor] ❌ No file returned from upload for image ${i + 1}`);
            }
          } catch (uploadError) {
            console.error(`[ListingProcessor] Error during Strapi upload for image ${i + 1}:`, uploadError);
            console.error(`[ListingProcessor] Upload error details:`, {
              message: uploadError instanceof Error ? uploadError.message : 'Unknown error',
              stack: uploadError instanceof Error ? uploadError.stack : undefined
            });
            
            // Clean up temp file on error
            if (tempFilePath && fs.existsSync(tempFilePath)) {
              try {
                fs.unlinkSync(tempFilePath);
                console.log(`[ListingProcessor] Cleaned up temp file after error: ${tempFilePath}`);
              } catch (e) {
                console.log(`[ListingProcessor] Could not delete temp file after error: ${tempFilePath}`);
              }
            }
            // Don't throw, continue with next image
            continue;
          }
          
        } catch (error) {
          console.error(`[ListingProcessor] Error processing image ${i + 1}:`, error);
          // Clean up temp file if it exists
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (e) {}
          }
          // Continue with next image
          continue;
        }
      }
      
      console.log(`[ListingProcessor] Successfully uploaded ${mediaIds.length} images`);
      return mediaIds;
      
    } catch (error) {
      console.error('[ListingProcessor] Error uploading images:', error);
      return [];
    }
  }
  */

  /**
   * Trích xuất product ID từ Shopee URL
   */
  private extractProductId(url: string): string | null {
    try {
      if (url.includes('shopee.vn')) {
        // Format 1: https://shopee.vn/product/shopId/productId
        let match = url.match(/product\/(\d+)\/(\d+)/);
        if (match) return match[2];
        
        // Format 2: https://shopee.vn/i.shopId.productId (new format from extension)
        match = url.match(/i\.(\d+)\.(\d+)/);
        if (match) return match[2];
        
        // Format 3: Just productId at the end after dot
        match = url.match(/\.(\d+)$/);
        if (match) return match[1];
        
        return null;
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
      // Format 1: https://shopee.vn/product/shopId/productId
      let match = url.match(/product\/(\d+)\/(\d+)/);
      if (match) return match[1];
      
      // Format 2: https://shopee.vn/i.shopId.productId (new format from extension)
      match = url.match(/i\.(\d+)\.(\d+)/);
      if (match) return match[1];
      
      return null;
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

  /**
   * Extract model number from product title
   */
  private extractModelNumber(title: string): string | null {
    // Common patterns: "S25 Ultra", "iPhone 15 Pro", "A54 5G", etc.
    const patterns = [
      /(?:Galaxy\s+)?([A-Z]\d{1,3}(?:\s+\w+)?)/i,  // Samsung: S25 Ultra, A54 5G
      /iPhone\s+(\d+(?:\s+\w+)?)/i,                 // iPhone: iPhone 15 Pro
      /Mi\s+(\d+\w*(?:\s+\w+)?)/i,                  // Xiaomi: Mi 11 Ultra
      /(?:Redmi|Note)\s+(\d+(?:\s+\w+)?)/i,         // Xiaomi: Redmi Note 12
      /(?:Pixel)\s+(\d+\w*)/i,                      // Google: Pixel 8 Pro
      /(?:OnePlus)\s+(\d+\w*)/i,                    // OnePlus: OnePlus 12
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
    
    return null;
  }

  /**
   * Extract platform product ID from URL
   */
  private extractPlatformProductId(url: string): string | null {
    if (!url) return null;
    
    if (url.includes('shopee.vn')) {
      const shopId = this.extractShopId(url);
      const productId = this.extractProductId(url);
      return shopId && productId ? `shopee:${shopId}_${productId}` : null;
    } else if (url.includes('lazada.vn')) {
      const productId = this.extractProductId(url);
      return productId ? `lazada:${productId}` : null;
    } else if (url.includes('tiki.vn')) {
      const productId = this.extractProductId(url);
      return productId ? `tiki:${productId}` : null;
    }
    
    return null;
  }

  /**
   * Find similar item by title similarity
   */
  private findSimilarItem(items: any[], targetTitle: string): any {
    if (!items || items.length === 0) return null;
    
    const normalizedTarget = this.normalizeTitle(targetTitle);
    let bestMatch = null;
    let bestScore = 0;
    
    for (const item of items) {
      const normalizedItem = this.normalizeTitle(item.Title || '');
      const score = this.calculateSimilarity(normalizedTarget, normalizedItem);
      
      // Threshold 0.8 (80% similarity)
      if (score > 0.8 && score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
    
    return bestMatch;
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/\[.*?\]/g, '')  // Remove brackets content
      .replace(/\(.*?\)/g, '')  // Remove parentheses content
      .replace(/[^\w\s]/g, ' ')  // Remove special chars
      .replace(/\s+/g, ' ')      // Multiple spaces to single
      .trim();
  }

  /**
   * Calculate similarity between two strings (Jaccard similarity)
   */
  /**
   * Update Item with latest data from listing
   */
  private async updateItemWithLatestData(item: any, product: ShopeeProduct, locale: string): Promise<any> {
    const platformId = product.productUrl ? this.extractPlatformProductId(product.productUrl) : null;
    
    // Build PlatformIdentifiers array
    let platformIdentifiers = item.PlatformIdentifiers || {};
    if (typeof platformIdentifiers === 'string') {
      try {
        platformIdentifiers = JSON.parse(platformIdentifiers);
      } catch {
        platformIdentifiers = {};
      }
    }
    
    if (platformId) {
      const [platform, id] = platformId.split(':');
      platformIdentifiers[platform] = id;
    }
    
    const updatedItem = await this.strapi.entityService.update('api::item.item', item.id, {
      data: {
        Price: (product.price !== null && product.price !== undefined) ? product.price : (item.Price || 0),
        Currency: product.currency || item.Currency || 'VND',
        Score: product.rating !== null && product.rating !== undefined ? product.rating : (item.Score || 0),
        Brand: product.brand ? product.brand.toUpperCase() : item.Brand,
        ModelNumber: item.ModelNumber || this.extractModelNumber(product.title || ''),
        PlatformIdentifiers: platformIdentifiers,
        DynamicFields: {
          ...(typeof item.DynamicFields === 'object' && item.DynamicFields ? item.DynamicFields : {}),
          lastUpdated: new Date().toISOString(),
          stock: product.stock,
          soldCount: product.soldCount
        }
      },
      locale: locale
    });
    
    return updatedItem || item;
  }

  /**
   * Create a new localization for an existing Item
   */
  private async createItemLocalization(existingItem: any, product: ShopeeProduct, locale: string): Promise<any> {
    try {
      const rawItemTitle = product.title || (product as any).productName || '';
      const itemTitle = this.fixVietnameseEncoding(rawItemTitle);

      // Find localized category for the target locale
      let localizedCategory = null;
      if (existingItem.Category) {
        try {
          // First check if existingItem.Category has documentId
          const categoryDocumentId = existingItem.Category.documentId || existingItem.Category;

          // Find the category in the target locale using documentId
          const categories = await this.strapi.entityService.findMany('api::category.category', {
            filters: {
              documentId: {
                $eq: categoryDocumentId
              }
            } as any,
            locale: locale,
            limit: 1
          });

          if (categories && categories.length > 0) {
            localizedCategory = categories[0];
            console.log('[ListingProcessor] Found localized category for locale', locale, ':', (localizedCategory as any).Title);
          }
        } catch (catError) {
          console.log('[ListingProcessor] Could not find localized category:', catError);
        }
      }

      // Use localized category if found, otherwise fallback to original
      const category = localizedCategory || existingItem.Category;

      // Generate matching codes
      const categoryName = category?.Title || product.category || 'item';
      const matchCode = this.titleNormalizer.generateMatchCode(itemTitle, product.brand, categoryName);
      const normalizedTitle = this.titleNormalizer.normalizeTitle(itemTitle, product.brand);
      const coreProductName = this.titleNormalizer.extractCoreProductName(itemTitle, product.brand);
      const itemSlug = this.generateSlug(coreProductName);

      // Build platform identifiers
      const platformId = product.productUrl ? this.extractPlatformProductId(product.productUrl) : null;
      let platformIdentifiers = {};
      if (platformId) {
        const [platform, id] = platformId.split(':');
        platformIdentifiers = { [platform]: id };
      }

      // Convert description to blocks format
      const descriptionBlocks = product.description ? [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              text: this.fixVietnameseEncoding(product.description)
            }
          ]
        }
      ] : [];

      // Get confidence score
      const confidence = this.itemValidator.getItemConfidence(product);

      console.log('[ListingProcessor] Creating localization for Item documentId:', existingItem.documentId, 'locale:', locale);

      // Use Strapi i18n clone method to create proper localization
      try {
        // First try using the i18n plugin's clone method
        const i18nService = (strapi as any).plugin('i18n')?.service('content-types');
        if (i18nService) {
          const clonedItem = await i18nService.createLocalization({
            id: existingItem.id,
            locale: locale,
            populate: ['Category']
          });

          if (clonedItem) {
            console.log('[ListingProcessor] Created Item localization using i18n service, ID:', clonedItem.id);

            // Update the cloned item with correct data and localized category
            const updatedItem = await this.strapi.entityService.update('api::item.item', clonedItem.id, {
              data: {
                Title: coreProductName,
                Slug: itemSlug,
                MatchCode: matchCode,
                NormalizedTitle: normalizedTitle,
                MatchConfidence: confidence,
                Description: descriptionBlocks as any,
                Price: product.price || 0,
                Currency: product.currency || 'VND',
                Score: product.rating || 0,
                Brand: product.brand ? (this.titleNormalizer.normalizeBrand(product.brand) || undefined) : undefined,
                ModelNumber: this.extractModelNumber(itemTitle) || undefined,
                PlatformIdentifiers: platformIdentifiers,
                // Set the localized category if found
                Category: localizedCategory ? localizedCategory.id : undefined
              },
              locale: locale
            });

            return updatedItem;
          }
        }
      } catch (i18nError) {
        console.log('[ListingProcessor] i18n service not available, using fallback method:', i18nError);
      }

      // Fallback: create with entityService and proper locale
      // In Strapi 5, use same documentId for localization
      const newLocaleItem = await this.strapi.entityService.create('api::item.item', {
        data: {
          Title: coreProductName,
          Slug: itemSlug,
          MatchCode: matchCode,
          NormalizedTitle: normalizedTitle,
          MatchConfidence: confidence,
          Description: descriptionBlocks,
          isActive: true,
          isFeatured: false,
          ItemType: 'Product',
          Price: product.price || 0,
          Currency: product.currency || 'VND',
          Score: product.rating || 0,
          Brand: product.brand ? this.titleNormalizer.normalizeBrand(product.brand) : null,
          ModelNumber: this.extractModelNumber(itemTitle),
          PlatformIdentifiers: platformIdentifiers,
          // Use localized category if found, otherwise don't set
          Category: localizedCategory ? localizedCategory.id : null,
          publishedAt: new Date().toISOString(),
          documentId: existingItem.documentId // Use same documentId for proper localization
        },
        locale: locale
      } as any);

      // Manually link the locales if documentId is available
      if (existingItem.documentId && newLocaleItem.id) {
        try {
          // Try to update the documentId to match
          await this.strapi.db.query('api::item.item').update({
            where: { id: newLocaleItem.id },
            data: { documentId: existingItem.documentId }
          });
          console.log('[ListingProcessor] Linked Item locales via documentId');
        } catch (linkError) {
          console.log('[ListingProcessor] Could not link documentIds:', linkError);
        }
      }

      console.log('[ListingProcessor] Created Item localization ID:', newLocaleItem.id, 'for locale:', locale);
      return newLocaleItem;
    } catch (error) {
      console.error('[ListingProcessor] Error creating Item localization:', error);
      return null;
    }
  }

  /**
   * Update Item with new platform ID
   */
  private async updateItemWithPlatformId(item: any, product: ShopeeProduct, platformId: string, locale: string): Promise<any> {
    return this.updateItemWithLatestData(item, product, locale);
  }

  /**
   * Extract brand from product data - try brand field first, then extract from title
   */
  private extractBrandFromProductData(product: ShopeeProduct): string {
    // 1. First check if brand is provided directly
    if (product.brand && product.brand.trim() !== '') {
      console.log('[ListingProcessor] Brand found in data:', product.brand);
      return this.fixVietnameseEncoding(product.brand);
    }

    // 2. Try to extract brand from title
    const title = product.title || (product as any).productName || '';
    const titleFixed = this.fixVietnameseEncoding(title);

    console.log('[ListingProcessor] Extracting brand from title:', titleFixed);

    // Common brands to look for in title
    const knownBrands = [
      'Apple', 'iPhone', 'Samsung', 'Galaxy', 'Xiaomi', 'Redmi', 'POCO',
      'Oppo', 'Vivo', 'Realme', 'OnePlus', 'Nokia', 'Sony', 'LG',
      'Huawei', 'Honor', 'Asus', 'ROG', 'Lenovo', 'Dell', 'HP',
      'MSI', 'Acer', 'Razer', 'Google', 'Pixel', 'Nothing',
      'TCL', 'Motorola', 'ZTE', 'Infinix', 'Tecno', 'Vsmart'
    ];

    // Check title for known brands (case-insensitive)
    const titleLower = titleFixed.toLowerCase();
    for (const brand of knownBrands) {
      if (titleLower.includes(brand.toLowerCase())) {
        console.log('[ListingProcessor] Extracted brand from title:', brand);
        return brand;
      }
    }

    // 3. Special handling for common patterns
    // "Điện thoại Apple iPhone..." -> Apple
    if (titleLower.includes('điện thoại apple') || titleLower.includes('iphone')) {
      return 'Apple';
    }
    if (titleLower.includes('điện thoại samsung') || titleLower.includes('galaxy')) {
      return 'Samsung';
    }
    if (titleLower.includes('điện thoại xiaomi') || titleLower.includes('redmi') || titleLower.includes('poco')) {
      return 'Xiaomi';
    }

    console.log('[ListingProcessor] Could not extract brand from product data');
    return ''; // Return empty string if no brand found
  }
}

export default ListingProcessorService;
