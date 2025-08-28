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
  }
}))
