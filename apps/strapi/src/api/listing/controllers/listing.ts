/**
 * listing controller
 */

import { factories } from "@strapi/strapi"
import ListingProcessorService from '../../../services/listingProcessor';

export default factories.createCoreController("api::listing.listing", ({ strapi }) => ({
  async testProcessor(ctx) {
    try {
      const { product, seller, review } = ctx.request.body;
      
      if (!product || !seller) {
        return ctx.badRequest('Missing required data: product and seller');
      }
      
      // Create test data with proper structure
      const testData = {
        product: {
          productUrl: product.productUrl || 'https://shopee.vn/product/88201679/14570132673',
          title: product.title || 'Test Product',
          description: product.description || '',
          price: product.price || 0,
          currency: product.currency || 'VND',
          category: product.category || 'Shopee > Điện Thoại & Phụ Kiện',
          brand: product.brand || '',
          images: product.images || [],
          stock: product.stock || 0,
          shipFrom: product.shipFrom || '',
          rating: product.rating || 0,
          soldCount: product.soldCount || 0
        },
        seller,
        review: review || null
      };
      
      // Process using ListingProcessor service
      const processor = new ListingProcessorService(strapi);
      const result = await processor.processShopeeData(testData);
      
      // Return the result
      ctx.body = {
        success: true,
        result
      };
      
    } catch (error) {
      strapi.log.error('Error in testProcessor:', error);
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async shopeeImport(ctx) {
    try {
      console.log('[ShopeeImport] Received data from extension');
      
      // Ensure proper UTF-8 encoding for Vietnamese characters
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      const data = ctx.request.body;
      
      // Check if data is from extension (validation format) or direct Shopee format
      let shopeeData;
      
      if (data.items && Array.isArray(data.items)) {
        // From extension via validation format
        console.log('[ShopeeImport] Processing validation format with', data.items.length, 'items');
        
        // Process first item if exists
        if (data.items.length > 0) {
          const item = data.items[0];
          shopeeData = {
            product: item.product || {},
            seller: item.seller || {},
            review: item.review || null
          };
        } else {
          return ctx.badRequest('No items to process');
        }
      } else if (data.product && data.seller) {
        // Direct Shopee format
        console.log('[ShopeeImport] Processing direct Shopee format');
        shopeeData = data;
      } else {
        return ctx.badRequest('Invalid data format');
      }
      
      // Process using ListingProcessor service
      const processor = new ListingProcessorService(strapi);
      const result = await processor.processShopeeData(shopeeData);
      
      console.log('[ShopeeImport] Processing result:', result);
      
      // Return the result
      ctx.body = {
        success: true,
        result,
        message: result.message
      };
      
    } catch (error) {
      strapi.log.error('[ShopeeImport] Error:', error);
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async directImport(ctx) {
    try {
      console.log('[DirectImport] Bypassing validation, creating listing directly');
      
      const data = ctx.request.body;
      const processor = new ListingProcessorService(strapi);
      
      // Process data directly without validation
      const processData = {
        product: data.product || data,
        seller: data.seller || {},
        review: data.review || null
      };
      
      const result = await processor.processShopeeData(processData);
      
      console.log('[DirectImport] Result:', result);
      
      ctx.body = {
        success: true,
        result,
        message: result.message
      };
      
    } catch (error) {
      strapi.log.error('[DirectImport] Error:', error);
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async universalImport(ctx) {
    try {
      console.log('[UniversalImport] Received data from extension');
      
      // Ensure proper UTF-8 encoding
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      const data = ctx.request.body;
      
      // Detect platform from URL
      const productUrl = data.product?.productUrl || data.productUrl || '';
      let platform = 'unknown';
      
      if (productUrl.includes('shopee.')) {
        platform = 'shopee';
      } else if (productUrl.includes('lazada.')) {
        platform = 'lazada';
      } else if (productUrl.includes('tiki.')) {
        platform = 'tiki';
      } else if (productUrl.includes('sendo.')) {
        platform = 'sendo';
      } else if (productUrl.includes('amazon.')) {
        platform = 'amazon';
      } else if (productUrl.includes('alibaba.') || productUrl.includes('1688.')) {
        platform = 'alibaba';
      } else if (productUrl.includes('taobao.')) {
        platform = 'taobao';
      } else if (productUrl.includes('facebook.com/marketplace')) {
        platform = 'facebook';
      } else if (productUrl.includes('chotot.')) {
        platform = 'chotot';
      }
      
      console.log(`[UniversalImport] Detected platform: ${platform} from URL: ${productUrl}`);
      
      // Process based on platform
      let result;
      const processor = new ListingProcessorService(strapi);
      
      // For now, all platforms use the same processing logic
      // Later can add specific processing for each platform
      let processData;
      
      // Handle different data formats
      if (data.items && Array.isArray(data.items)) {
        // From extension via validation format
        if (data.items.length > 0) {
          const item = data.items[0];
          processData = {
            product: item.product || {},
            seller: item.seller || {},
            review: item.review || null
          };
        } else {
          return ctx.badRequest('No items to process');
        }
      } else if (data.product || data.productUrl) {
        // Direct format
        processData = {
          product: data.product || data,
          seller: data.seller || {},
          review: data.review || null
        };
      } else {
        return ctx.badRequest('Invalid data format');
      }
      
      // Process data
      result = await processor.processShopeeData(processData); // Will rename to processData later
      
      console.log('[UniversalImport] Processing result:', result);
      
      // Return the result
      ctx.body = {
        success: true,
        platform,
        result,
        message: result.message
      };
      
    } catch (error) {
      strapi.log.error('[UniversalImport] Error:', error);
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  async createListing(ctx) {
    try {
      const data = ctx.request.body;
      const source = ctx.query.source || 'extension';
      
      // Initialize variables that might be used later
      let validationResult = null;
      let validationService = null;
      
      // For large batches, use queue for async processing
      if (data.items && data.items.length > 10) {
        console.log(`[CreateListing] Large batch detected: ${data.items.length} items - adding to queue IMMEDIATELY`);
        
        // USE QUEUE IMMEDIATELY TO AVOID TIMEOUT
        const bullmqService = (global as any).bullmqService;
        
        if (bullmqService) {
          console.log('[CreateListing] BullMQ available, adding entire batch to queue without preprocessing');
          
          try {
            // Add ENTIRE batch to queue WITHOUT any processing with timeout
            console.log('[CreateListing] Adding job to BullMQ queue...');
            
            const jobPromise = bullmqService.addJob({
              ...data,
              source: source
            }, {
              priority: 1 // Higher priority for large batches
            });
            
            // Add 3-second timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('BullMQ addJob timeout')), 3000);
            });
            
            const job = await Promise.race([jobPromise, timeoutPromise]);
            
            console.log(`[CreateListing] Large batch job ${job.id} added to queue successfully`);
            
            // Set response headers and body, then return IMMEDIATELY
            ctx.status = 200;
            ctx.set('Content-Type', 'application/json; charset=utf-8');
            ctx.body = {
              success: true,
              queued: true,
              jobId: job.id,
              message: `Đã nhận batch ${data.items.length} items để xử lý nền`,
              itemCount: data.items.length
            };
            
            // Force immediate response by calling send if available
            if (ctx.respond !== false) {
              ctx.respond = true;
            }
            
            return; // Exit immediately - worker will handle everything
          } catch (queueError) {
            console.error('[CreateListing] Error adding to queue:', queueError);
            // Fall through to direct processing if queue fails
          }
        }
        
        console.log('[CreateListing] WARNING: BullMQ not available, processing directly (may timeout)');
        
        // Debug: Log first few items structure
        console.log('[CreateListing] Sample items structure:');
        data.items.slice(0, 3).forEach((item: any, index: number) => {
          console.log(`Item ${index}:`, {
            hasProduct: !!item.product,
            hasProductUrl: !!(item.product?.productUrl),
            hasUrl: !!(item.url),
            hasReview: !!item.review,
            keys: Object.keys(item),
            // Log actual URL values
            productUrl: item.product?.productUrl || 'none',
            url: item.url || 'none',
            productLink: item.product?.link || 'none'
          });
          // Log first item in full detail
          if (index === 0) {
            console.log(`Item ${index} full structure:`, JSON.stringify(item, null, 2).substring(0, 500));
          }
        });
        
        // Separate products and reviews
        const productItems = data.items.filter((item: any) => {
          // Check if item has review content - if yes, it's a review not a product
          const hasReviewContent = item.review && item.review.content;
          if (hasReviewContent) {
            return false; // This is a review, not a product
          }
          
          // An item is a product if it has product data with a URL OR has URL directly
          // Check multiple possible structures from extension
          const isProduct = 
            (item.product && (item.product.productUrl || item.product.url || item.product.link)) || 
            item.productUrl || 
            item.url ||
            (item.title && item.price); // Product có title và price
          
          return isProduct;
        });
        
        const reviewItems = data.items.filter((item: any) => {
          // An item is a review if it has review data
          return item.review && item.review.content;
        });
        
        console.log(`[CreateListing] Filtered: ${productItems.length} products, ${reviewItems.length} reviews from ${data.items.length} total items`);
        
        // Deduplicate products by product ID (not URL) to avoid duplicate processing
        // Different product IDs = different products even if same seller
        const uniqueProducts = new Map();
        productItems.forEach((item: any) => {
          // Get URL from various possible locations  
          const url = item.product?.url ||           // Extension sends product.url
                     item.product?.productUrl ||     // Alternative format
                     item.productUrl ||               // Direct URL
                     item.url ||                      // Direct URL alt
                     item.product?.link;              // Link format
          
          // Extract product ID from URL for Shopee (format: i.shopId.productId)
          let productKey = url;
          if (url && url.includes('shopee.vn/')) {
            const match = url.match(/i\.(\d+)\.(\d+)/);
            if (match) {
              productKey = `${match[1]}_${match[2]}`; // shopId_productId
              console.log(`[CreateListing] Extracted product ID: ${productKey} from URL: ${url}`);
            }
          }
          
          if (productKey) {
            if (!uniqueProducts.has(productKey)) {
              uniqueProducts.set(productKey, item);
            } else {
              console.log(`[CreateListing] Skipping duplicate product ID: ${productKey}`);
            }
          } else {
            // No URL/ID found, use title as fallback key
            const key = item.title || item.product?.title || JSON.stringify(item).substring(0, 50);
            if (!uniqueProducts.has(key)) {
              uniqueProducts.set(key, item);
              console.log(`[CreateListing] Product without ID, using key: ${key}`);
            }
          }
        });
        
        const dedupedProductItems = Array.from(uniqueProducts.values());
        console.log(`[CreateListing] After deduplication: ${dedupedProductItems.length} unique products from ${productItems.length} total products`);
        
        // Process both products and reviews, but ensure products are unique
        const processItems = [...dedupedProductItems, ...reviewItems];
        console.log(`[CreateListing] Will process: ${dedupedProductItems.length} unique products + ${reviewItems.length} reviews = ${processItems.length} total items`);
        
        // If no items to process
        if (processItems.length === 0) {
          ctx.body = {
            success: false,
            error: 'No valid items found in batch',
            message: 'Batch contained no products or reviews to process'
          };
          return;
        }
        
        // Process directly since queue not available or failed
        console.log('[CreateListing] Processing large batch directly without queue');
        const { getValidationService } = require('../../../services/unifiedValidation');
        const validationService = getValidationService(strapi);
        
        // Process each product individually to ensure all are processed
        const results = [];
        const errors = [];
        const allWarnings = [];
        
        // Process products first
        for (const productItem of dedupedProductItems) {
          try {
            console.log(`[CreateListing] Processing product ${dedupedProductItems.indexOf(productItem) + 1}/${dedupedProductItems.length}`);
            
            const singleItemData = { items: [productItem] };
            const itemValidation = await validationService.validate(singleItemData, source);
            
            if (!itemValidation.isValid) {
              errors.push(...itemValidation.errors);
              allWarnings.push(...itemValidation.warnings);
              continue;
            }
            
            const result = await validationService.processValidatedData(itemValidation);
            results.push(result);
            
            if (itemValidation.warnings) {
              allWarnings.push(...itemValidation.warnings);
            }
          } catch (error) {
            console.error('[CreateListing] Error processing product:', error);
            errors.push(`Failed to process product: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        // Process reviews (if any)
        for (const reviewItem of reviewItems) {
          try {
            const singleItemData = { items: [reviewItem] };
            const itemValidation = await validationService.validate(singleItemData, source);
            
            if (itemValidation.isValid) {
              const result = await validationService.processValidatedData(itemValidation);
              results.push(result);
            }
          } catch (error) {
            console.error('[CreateListing] Error processing review:', error);
            // Reviews are less critical, just log the error
          }
        }
        
        ctx.body = {
          success: errors.length === 0,
          queued: false,
          message: `Đã xử lý ${results.length}/${processItems.length} items (${dedupedProductItems.length} products, ${reviewItems.length} reviews)`,
          results: results.length === 1 ? results[0] : results,
          errors,
          warnings: [...new Set(allWarnings)] // Remove duplicate warnings
        };
        
        return; // Exit early
      }
      
      // For smaller batches, process each item
      console.log('[CreateListing] Processing small batch');
      
      // Use Unified Validation Service
      const { getValidationService } = require('../../../services/unifiedValidation');
      validationService = getValidationService(strapi);
      
      // Process each item if batch
      if (data.items && Array.isArray(data.items) && data.items.length > 1) {
        console.log(`[CreateListing] Processing ${data.items.length} items individually`);
        
        const results = [];
        const errors = [];
        const warnings = [];
        
        for (const item of data.items) {
          const singleItemData = { items: [item] };
          
          // Validate single item
          const itemValidation = await validationService.validate(singleItemData, source);
          
          if (!itemValidation.isValid) {
            errors.push(...itemValidation.errors);
            warnings.push(...itemValidation.warnings);
            continue;
          }
          
          // Process validated item
          try {
            const result = await validationService.processValidatedData(itemValidation);
            results.push(result);
          } catch (error) {
            console.error('[CreateListing] Error processing item:', error);
            errors.push(`Failed to process item: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        ctx.body = {
          success: errors.length === 0,
          queued: false,
          message: `Processed ${results.length} of ${data.items.length} items`,
          results,
          errors,
          warnings
        };
        
        return;
      }
      
      // Single item or already processed batch
      console.log('[CreateListing] Using Unified Validation Service for single item');
      
      // Step 1: Validate data
      validationResult = await validationService.validate(data, source);
      
      console.log('[CreateListing] Validation result:', {
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
      
      // If validation failed, return errors
      if (!validationResult.isValid) {
        ctx.status = 400;
        return ctx.body = {
          success: false,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        };
      }
      
      // Check if we should queue or process directly for small batches
      const shouldQueue = ctx.query.queue === 'true' || 
                         (data.items && data.items.length > 5); // Queue if batch > 5
      
      console.log('[CreateListing] shouldQueue:', shouldQueue, 'items:', data.items?.length);
      
      if (shouldQueue) {
        // Add to BullMQ queue for async processing
        const bullmqService = (global as any).bullmqService;
        
        if (bullmqService) {
          console.log('[CreateListing] Adding to BullMQ queue for async processing');
          
          try {
            // Add to queue BEFORE returning response
            const job = await bullmqService.addJob({
              ...data,
              source: source,
              validatedData: validationResult?.data
            }, {
              priority: ctx.query.priority || 0
            });
            
            console.log(`[CreateListing] Job ${job.id} added to queue successfully`);
            
            // Now return response
            ctx.body = {
              success: true,
              queued: true,
              jobId: job.id,
              message: `Đã nhận ${data.items?.length || 1} items để xử lý`,
              warnings: validationResult?.warnings || []
            };
            
            return; // Important: return here to prevent further execution
          } catch (queueError) {
            console.error('[CreateListing] Error adding to queue:', queueError);
            // Fall through to direct processing if queue fails
            console.log('[CreateListing] Falling back to direct processing due to queue error');
          }
        } else {
          console.log('[CreateListing] BullMQ service not available, processing directly');
        }
      }
      
      // Process immediately if not queued
      if (validationService && validationResult) {
        const result = await validationService.processValidatedData(validationResult);
        
        console.log('[CreateListing] Direct processing complete:', result);
        
        ctx.body = {
          success: true,
          queued: false,
          listingId: result.listing?.id,
          message: `Đã tạo listing thành công: ${result.listing?.title || 'Unknown'}`,
          data: result,
          warnings: validationResult.warnings
        };
      } else {
        // Should not reach here, but handle edge case
        ctx.body = {
          success: false,
          error: 'Invalid processing state'
        };
      }
      
    } catch (error) {
      console.error('[CreateListing] Error:', error);
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
      };
    }
  }
}))
