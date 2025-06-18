import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  // Server bootstrap - no custom field registration here
  // Custom fields are registered in admin/src/index.tsx
  strapi.log.info('[Smart Component Filter] Server bootstrap completed');
  
  // Add server-side middleware for Dynamic Zone filtering
  console.log('🚀 [Smart Component Filter] Server middleware initializing...');
  
  // Register middleware to intercept component API calls
  strapi.server.use(async (ctx: any, next: any) => {
    // Only intercept content-type-builder component requests
    if (ctx.url.includes('/content-type-builder/components') && ctx.method === 'GET') {
      console.log('🎯 [Smart Component Filter] Intercepting components API call');
      
      // Call next to get the original response
      await next();
      
      try {
        // Extract item ID from referer URL
        const referer = ctx.headers.referer || '';
        console.log('📍 [Smart Component Filter] Referer URL:', referer);
        
        // Check if this is an Item editing page - FIXED URL PATTERN
        const itemMatch = referer.match(/\/content-manager\/collection-types\/api::item\.item\/([^?]+)/) ||
                         referer.match(/\/api::item\.item\/([^?]+)/);
        
        if (itemMatch && itemMatch[1] && itemMatch[1] !== 'create') {
          const itemId = itemMatch[1];
          console.log('🔍 [Smart Component Filter] Found Item ID:', itemId);
          
          // Fetch the item to get its ListingType
          const item = await strapi.documents('api::item.item').findOne({
            documentId: itemId,
            populate: ['ListingType']
          });
          
          console.log('📄 [Smart Component Filter] Item data:', item);
          
          if (item && item.ListingType && item.ListingType.length > 0) {
            const listingType = item.ListingType[0];
            console.log('🏷️ [Smart Component Filter] ListingType:', listingType);
            
            // FIXED: Use TestComponentFilter instead of ItemField
            if (listingType.TestComponentFilter && Array.isArray(listingType.TestComponentFilter)) {
              console.log('📋 [Smart Component Filter] TestComponentFilter rules:', listingType.TestComponentFilter);
              
              // Get the original response body
              const originalComponents = ctx.body;
              console.log('🧩 [Smart Component Filter] Original components count:', originalComponents?.length || 0);
              
              if (originalComponents && Array.isArray(originalComponents)) {
                // Filter components based on TestComponentFilter rules
                const allowedComponents = originalComponents.filter((component: any) => {
                  const componentKey = `${component.category}.${component.info.displayName.toLowerCase()}`;
                  const isAllowed = listingType.TestComponentFilter.includes(componentKey);
                  
                  if (isAllowed) {
                    console.log('✅ [Smart Component Filter] Allowing component:', componentKey);
                  } else {
                    console.log('❌ [Smart Component Filter] Filtering out component:', componentKey);
                  }
                  
                  return isAllowed;
                });
                
                console.log(`🎯 [Smart Component Filter] Filtered from ${originalComponents.length} to ${allowedComponents.length} components`);
                
                // Modify the response body
                ctx.body = allowedComponents;
              }
            } else {
              console.log('⚠️ [Smart Component Filter] No TestComponentFilter rules found in ListingType');
            }
          } else {
            console.log('⚠️ [Smart Component Filter] No ListingType found for item');
          }
        } else {
          console.log('ℹ️ [Smart Component Filter] Not an Item editing page or create page');
        }
      } catch (error) {
        console.error('❌ [Smart Component Filter] Error in middleware:', error);
        // Don't break the request if filtering fails
      }
    } else {
      // For all other requests, just continue
      await next();
    }
  });
  
  console.log('✅ [Smart Component Filter] Server middleware registered successfully');
};

// Helper function to extract item ID from referer URL
function extractItemIdFromReferer(referer: string): string | null {
  // Strapi 5 uses documentId format like: /content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk
  const match = referer.match(/\/content-manager\/collection-types\/api::item\.item\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
