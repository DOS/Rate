/**
 * Unified Validation Service
 * Central validation for all data sources (extension, crawler, manual import, etc.)
 */

import { Core } from '@strapi/strapi';
import ListingProcessorService from './listingProcessor';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedData?: any;
  aiAnalysis?: {
    isScam: boolean;
    scamScore: number;
    reasons: string[];
  };
}

interface ProductData {
  productUrl?: string;
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  images?: string[];
  platform?: string;
  seller?: any;
  reviews?: any[];
  ListingID?: string;
  // Additional Shopee fields for proper mapping
  category?: string;
  brand?: string;
  stock?: number;
  soldCount?: number;
  rating?: number;
  productReviewCount?: number;
  likedCount?: number;
}

export default class UnifiedValidationService {
  private strapi: Core.Strapi;
  
  constructor(strapi: Core.Strapi) {
    this.strapi = strapi;
  }
  
  /**
   * Main validation entry point for all sources
   */
  async validate(data: any, source: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    try {
      // Step 1: Normalize data based on source
      const normalized = await this.normalizeData(data, source);
      result.normalizedData = normalized;
      
      // Step 2: Basic validation
      const basicValidation = this.validateBasicRules(normalized);
      result.errors.push(...basicValidation.errors);
      result.warnings.push(...basicValidation.warnings);
      
      // Step 3: Business rules validation
      const businessValidation = await this.validateBusinessRules(normalized);
      result.errors.push(...businessValidation.errors);
      result.warnings.push(...businessValidation.warnings);
      
      // Step 4: AI-based scam detection (if enabled)
      if (process.env.AI_VALIDATION_ENABLED === 'true') {
        const aiResult = await this.performAIValidation(normalized);
        result.aiAnalysis = aiResult;
        
        if (aiResult.isScam && aiResult.scamScore > 0.8) {
          result.errors.push(`High scam probability detected: ${aiResult.reasons.join(', ')}`);
        } else if (aiResult.scamScore > 0.5) {
          result.warnings.push(`Potential scam indicators: ${aiResult.reasons.join(', ')}`);
        }
      }
      
      // Step 5: Duplicate check - Temporarily disabled due to column issue
      // TODO: Re-enable after fixing database schema
      // const isDuplicate = await this.checkDuplicate(normalized);
      // if (isDuplicate) {
      //   result.warnings.push('Similar listing already exists');
      // }
      
      // Final validation status
      result.isValid = result.errors.length === 0;
      
    } catch (error) {
      this.strapi.log.error('Validation error:', error);
      result.isValid = false;
      result.errors.push('Validation failed: ' + (error as Error).message);
    }
    
    return result;
  }
  
  /**
   * Normalize data from different sources
   */
  private async normalizeData(data: any, source: string): Promise<ProductData> {
    let normalized: ProductData = {};
    
    switch (source) {
      case 'extension':
        // Handle extension format
        if (data.items && Array.isArray(data.items)) {
          const item = data.items[0];
          // Fix URL format issues and force platform detection from URL
          // Extension may send without URL in some cases (e.g., from review data)
          const productUrl = this.normalizeUrl(item.product?.url || item.product?.productUrl || item.product?.link || '');
          const detectedPlatform = productUrl ? this.detectPlatform(productUrl) : 'shopee';
          
          normalized = {
            ...item.product,
            title: item.product?.title || item.product?.name || '',
            productUrl,
            platform: detectedPlatform, // Force platform detection from URL
            seller: item.seller,
            reviews: item.reviews,
            // Ensure key Shopee fields are preserved
            category: item.product?.category,
            brand: item.product?.brand,
            stock: item.product?.stock || 0,
            soldCount: item.product?.soldCount || 0,
            rating: item.product?.rating || 0,
            productReviewCount: item.product?.productReviewCount || 0,
            likedCount: item.product?.likedCount || 0
          };
          
          console.log('[UnifiedValidation] Extension item normalized - URL:', productUrl, 'Platform:', detectedPlatform, 'Title:', normalized.title);
        } else if (data.product) {
          // Fix URL format issues and force platform detection from URL
          // Extension may send without URL in some cases (e.g., from review data)
          const productUrl = this.normalizeUrl(data.product?.url || data.product?.productUrl || data.product?.link || '');
          const detectedPlatform = productUrl ? this.detectPlatform(productUrl) : 'shopee';
          
          normalized = {
            ...data.product,
            title: data.product?.title || data.product?.name || '',
            productUrl,
            platform: detectedPlatform, // Force platform detection from URL
            seller: data.seller,
            reviews: data.reviews,
            // Ensure key Shopee fields are preserved
            category: data.product?.category,
            brand: data.product?.brand,
            stock: data.product?.stock || 0,
            soldCount: data.product?.soldCount || 0,
            rating: data.product?.rating || 0,
            productReviewCount: data.product?.productReviewCount || 0,
            likedCount: data.product?.likedCount || 0
          };
        }
        break;
        
      case 'crawler':
        // Handle crawler format
        normalized = {
          productUrl: data.url || data.productUrl,
          title: data.name || data.title,
          description: data.description,
          price: parseFloat(data.price) || 0,
          currency: data.currency || 'VND',
          images: data.images || data.image_urls || [],
          platform: data.platform || this.detectPlatform(data.url),
          seller: data.seller || data.shop,
          reviews: data.reviews || data.comments,
          // Map additional fields for proper field mapping
          category: data.category,
          brand: data.brand,
          stock: data.stock || 0,
          soldCount: data.soldCount || data.sold_count || 0,
          rating: data.rating || data.averageRating || 0,
          productReviewCount: data.productReviewCount || data.totalReviews || 0,
          likedCount: data.likedCount || data.favoriteCount || 0
        };
        break;
        
      case 'manual':
        // Handle manual import format
        normalized = {
          title: data.title,
          description: data.description,
          price: data.price,
          currency: data.currency || 'VND',
          images: data.images || [],
          platform: data.platform || 'manual',
          seller: data.seller || { name: 'Manual Import' },
          // Add manual import fields
          category: data.category,
          brand: data.brand,
          stock: data.stock || 0,
          soldCount: data.soldCount || 0,
          rating: data.rating || 0,
          productReviewCount: data.productReviewCount || 0,
          likedCount: data.likedCount || 0
        };
        break;
        
      case 'api':
        // Direct API format
        normalized = data;
        break;
        
      default:
        // Try to auto-detect format
        normalized = this.autoDetectFormat(data);
    }
    
    // Fix URL format issues before platform detection
    if (normalized.productUrl) {
      normalized.productUrl = this.normalizeUrl(normalized.productUrl);
    }
    
    // Ensure platform is detected (only if not already set)
    if (!normalized.platform && normalized.productUrl) {
      console.log('[UnifiedValidation] Platform not set, detecting from URL:', normalized.productUrl);
      normalized.platform = this.detectPlatform(normalized.productUrl);
    } else if (normalized.platform === 'unknown' && normalized.productUrl) {
      // Try to re-detect if platform is unknown
      console.log('[UnifiedValidation] Platform is unknown, re-detecting from URL:', normalized.productUrl);
      normalized.platform = this.detectPlatform(normalized.productUrl);
    }
    
    // Generate deterministic ListingID based on URL (same logic as ListingProcessor)
    // This prevents duplicates when the same URL is processed multiple times
    if (normalized.productUrl && normalized.platform) {
      normalized.ListingID = this.generateListingID(normalized.productUrl, normalized.platform);
    } else {
      // Fallback for manual entries without URL
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      normalized.ListingID = `${normalized.platform || 'manual'}_${timestamp}_${random}`;
    }
    
    return normalized;
  }
  
  /**
   * Validate basic data rules
   */
  private validateBasicRules(data: ProductData): { errors: string[], warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields - skip validation if no title (likely a review-only item)
    if (!data.title || data.title.trim().length === 0) {
      // Don't error out - just warn and skip this item
      warnings.push('Product title is missing - skipping item');
      // Return early with soft failure
      return { errors: [], warnings: ['Product title is missing - item will be skipped'] };
    }
    
    if (!data.price || data.price <= 0) {
      warnings.push('Product price is missing or invalid');
    }
    
    // Data quality checks
    if (data.title && data.title.length < 10) {
      warnings.push('Product title seems too short');
    }
    
    if (data.description && data.description.length < 20) {
      warnings.push('Product description seems too short');
    }
    
    if (!data.images || data.images.length === 0) {
      warnings.push('No product images provided');
    }
    
    // URL validation
    if (data.productUrl && !this.isValidUrl(data.productUrl)) {
      errors.push('Invalid product URL');
    }
    
    return { errors, warnings };
  }
  
  /**
   * Validate business rules
   */
  private async validateBusinessRules(data: ProductData): Promise<{ errors: string[], warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Platform-specific rules
    if (data.platform === 'shopee') {
      if (!data.seller?.shop_id) {
        warnings.push('Shopee shop ID is missing');
      }
    }
    
    // Price range validation
    if (data.price) {
      if (data.price > 1000000000) { // 1 billion VND
        warnings.push('Price seems unusually high');
      }
      if (data.price < 1000) { // Less than 1000 VND
        warnings.push('Price seems unusually low');
      }
    }
    
    // Category validation (if we have categories)
    // TODO: Check if category exists in database
    
    return { errors, warnings };
  }
  
  /**
   * AI-based validation (scam detection)
   */
  private async performAIValidation(data: ProductData): Promise<any> {
    try {
      // Call AI service for scam detection
      // This would integrate with your GPT-4o-mini service
      const aiService = (global as any).aiService;
      
      if (!aiService) {
        return {
          isScam: false,
          scamScore: 0,
          reasons: []
        };
      }
      
      // Analyze for scam indicators
      const analysis = await aiService.analyzeForScam({
        title: data.title,
        description: data.description,
        price: data.price,
        seller: data.seller,
        platform: data.platform
      });
      
      return analysis;
      
    } catch (error) {
      this.strapi.log.warn('AI validation failed:', error);
      return {
        isScam: false,
        scamScore: 0,
        reasons: ['AI validation unavailable']
      };
    }
  }
  
  /**
   * Check for duplicate listings
   */
  private async checkDuplicate(data: ProductData): Promise<boolean> {
    try {
      // Check by URL (column is 'url' not 'source_url')
      if (data.productUrl) {
        const existing = await this.strapi.db.query('api::listing.listing').findOne({
          where: {
            url: data.productUrl
          }
        });
        
        if (existing) {
          return true;
        }
      }
      
      // Check by title similarity (simple check)
      if (data.title) {
        const similar = await this.strapi.db.query('api::listing.listing').findMany({
          where: {
            title: {
              $containsi: data.title.substring(0, 30)
            }
          },
          limit: 1
        });
        
        if (similar && similar.length > 0) {
          // Could implement more sophisticated similarity check here
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      this.strapi.log.warn('Duplicate check failed:', error);
      return false;
    }
  }
  
  /**
   * Auto-detect data format
   */
  private autoDetectFormat(data: any): ProductData {
    // Try to intelligently map fields
    return {
      productUrl: data.url || data.productUrl || data.link,
      title: data.title || data.name || data.product_name,
      description: data.description || data.desc || data.details,
      price: data.price || data.cost || data.amount,
      currency: data.currency || 'VND',
      images: data.images || data.photos || data.pictures || [],
      platform: data.platform || 'unknown',
      seller: data.seller || data.shop || data.vendor,
      reviews: data.reviews || data.comments || data.feedback,
      // Auto-detect additional fields
      category: data.category,
      brand: data.brand,
      stock: data.stock || 0,
      soldCount: data.soldCount || data.sold_count || 0,
      rating: data.rating || data.averageRating || 0,
      productReviewCount: data.productReviewCount || data.totalReviews || 0,
      likedCount: data.likedCount || data.favoriteCount || 0
    };
  }
  
  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): string {
    if (!url) {
      console.log('[UnifiedValidation] detectPlatform: No URL provided');
      return 'unknown';
    }
    
    // Normalize URL first - fix common format issues
    let normalizedUrl = url.toLowerCase();
    
    // Fix missing dot in domain (shopee/vn -> shopee.vn)
    normalizedUrl = normalizedUrl.replace(/shopee\/vn/g, 'shopee.vn');
    normalizedUrl = normalizedUrl.replace(/lazada\/vn/g, 'lazada.vn');
    normalizedUrl = normalizedUrl.replace(/tiki\/vn/g, 'tiki.vn');
    
    console.log('[UnifiedValidation] detectPlatform - Original URL:', url);
    console.log('[UnifiedValidation] detectPlatform - Normalized URL:', normalizedUrl);
    
    const platforms = {
      'shopee.vn': 'shopee',
      'shopee.': 'shopee',
      'lazada.vn': 'lazada', 
      'lazada.': 'lazada',
      'tiki.vn': 'tiki',
      'tiki.': 'tiki',
      'sendo.vn': 'sendo',
      'sendo.': 'sendo',
      'amazon.': 'amazon',
      'alibaba.': 'alibaba',
      '1688.': 'alibaba',
      'taobao.': 'taobao',
      'facebook.com/marketplace': 'facebook',
      'chotot.vn': 'chotot',
      'chotot.': 'chotot'
    };
    
    for (const [pattern, platform] of Object.entries(platforms)) {
      if (normalizedUrl.includes(pattern)) {
        console.log('[UnifiedValidation] detectPlatform - Matched pattern:', pattern, '-> platform:', platform);
        return platform;
      }
    }
    
    console.log('[UnifiedValidation] detectPlatform - No pattern matched, returning unknown');
    return 'unknown';
  }
  
  /**
   * Normalize URL format - fix common URL issues
   */
  private normalizeUrl(url: string): string {
    if (!url) return url;
    
    let normalized = url.trim();
    
    // Fix missing dots in domain names
    normalized = normalized.replace(/shopee\/vn/g, 'shopee.vn');
    normalized = normalized.replace(/lazada\/vn/g, 'lazada.vn');
    normalized = normalized.replace(/tiki\/vn/g, 'tiki.vn');
    normalized = normalized.replace(/sendo\/vn/g, 'sendo.vn');
    normalized = normalized.replace(/chotot\/vn/g, 'chotot.vn');
    
    // Ensure protocol exists
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    
    return normalized;
  }
  
  /**
   * Generate deterministic ListingID from URL (same logic as ListingProcessor)
   */
  private generateListingID(productUrl: string, platform: string): string {
    if (platform === 'shopee') {
      const productId = this.extractProductId(productUrl);
      const shopId = this.extractShopId(productUrl);
      if (productId && shopId) {
        return `shopee-vn.${shopId}_${productId}`;
      }
    } else if (platform === 'lazada') {
      const productId = this.extractProductId(productUrl);
      if (productId) {
        return `lazada-vn.${productId}`;
      }
    } else if (platform === 'tiki') {
      const productId = this.extractProductId(productUrl);
      if (productId) {
        return `tiki-vn.${productId}`;
      }
    }
    
    // Fallback: use URL hash
    const hash = this.generateUrlHash(productUrl);
    return `${platform}.${hash}`;
  }
  
  /**
   * Extract product ID from URL
   */
  private extractProductId(url: string): string | null {
    try {
      if (url.includes('shopee.vn')) {
        // Format 1: https://shopee.vn/product/shopId/productId
        let match = url.match(/product\/(\d+)\/(\d+)/);
        if (match) return match[2];
        
        // Format 2: https://shopee.vn/i.shopId.productId
        match = url.match(/i\.(\d+)\.(\d+)/);
        if (match) return match[2];
        
        return null;
      }
      if (url.includes('lazada.vn')) {
        const match = url.match(/i(\d+)/);
        return match ? match[1] : null;
      }
      if (url.includes('tiki.vn')) {
        const match = url.match(/p(\d+)/);
        return match ? match[1] : null;
      }
      return null;
    } catch {
      return null;
    }
  }
  
  /**
   * Extract shop ID from Shopee URL
   */
  private extractShopId(url: string): string | null {
    try {
      // Format 1: https://shopee.vn/product/shopId/productId
      let match = url.match(/product\/(\d+)\/(\d+)/);
      if (match) return match[1];
      
      // Format 2: https://shopee.vn/i.shopId.productId
      match = url.match(/i\.(\d+)\.(\d+)/);
      if (match) return match[1];
      
      return null;
    } catch {
      return null;
    }
  }
  
  /**
   * Generate hash from URL for fallback ListingID
   */
  private generateUrlHash(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Process validated data into listing
   */
  async processValidatedData(validationResult: ValidationResult): Promise<any> {
    if (!validationResult.isValid) {
      const errorMessage = validationResult.errors && validationResult.errors.length > 0 
        ? validationResult.errors.join(', ')
        : 'Validation failed';
      throw new Error('Cannot process invalid data: ' + errorMessage);
    }
    
    const data = validationResult.normalizedData;
    
    // Use the listing processor to create the listing
    const processor = new ListingProcessorService(this.strapi);
    
    // Pass the ListingID from normalized data
    const productData = {
      ...data,
      ListingID: data.ListingID // Ensure ListingID is passed
    };
    
    return await processor.processShopeeData({
      product: productData,
      seller: data.seller,
      review: data.reviews?.[0]
    });
  }
}

// Export factory function - NOT singleton to avoid strapi context issues
export function getValidationService(strapi: Core.Strapi): UnifiedValidationService {
  // Always create new instance to ensure fresh strapi context
  return new UnifiedValidationService(strapi);
}