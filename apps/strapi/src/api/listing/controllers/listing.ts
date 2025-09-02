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
  }
}))
