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
  }
}))
