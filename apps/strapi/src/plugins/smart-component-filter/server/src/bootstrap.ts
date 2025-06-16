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
      console.log('📍 [Smart Component Filter] Referer:', ctx.headers.referer);
      
      try {
        // Get the original response first
        await next();
        
        // Check if this is for Item content type editing
        const referer = ctx.headers.referer || '';
        const isItemEdit = referer.includes('/content-manager/collection-types/api::item.item');
        
        if (isItemEdit && ctx.body && Array.isArray(ctx.body.data)) {
          console.log('📝 [Smart Component Filter] Filtering components for Item editing');
          console.log('📦 [Smart Component Filter] Original components count:', ctx.body.data.length);
          
          // Get current item data to determine ListingType
          const itemId = extractItemIdFromReferer(referer);
          let allowedComponents: string[] = [];
          
          if (itemId) {
            console.log('🔍 [Smart Component Filter] Extracted item ID:', itemId);
            
            // Fetch item to get ListingType
            const item = await strapi.entityService.findOne('api::item.item', itemId, {
              populate: ['ListingType']
            });
            
            console.log('📋 [Smart Component Filter] Item data:', {
              id: item?.id,
              documentId: item?.documentId,
              title: item?.Title,
              listingType: item?.ListingType
            });
            
            if (item?.ListingType?.ItemField) {
              console.log(`🎯 [Smart Component Filter] Found ListingType rules:`, item.ListingType.ItemField);
              allowedComponents = item.ListingType.ItemField;
            } else {
              console.log('⚠️ [Smart Component Filter] No ItemField rules found');
            }
          } else {
            console.log('⚠️ [Smart Component Filter] Could not extract item ID from referer');
          }
          
          // Filter components based on rules
          if (allowedComponents.length > 0) {
            console.log('🔧 [Smart Component Filter] Applying filter with rules:', allowedComponents);
            
            const filteredComponents = ctx.body.data.filter((component: any) => {
              // Try different component key formats
              const uid = component.uid || '';
              const category = component.category || '';
              const displayName = component.info?.displayName || component.schema?.displayName || '';
              
              // Check various formats that might match ItemField rules
              const possibleKeys = [
                uid, // e.g., "contact.basic"
                `${category}.${displayName.toLowerCase()}`,
                `${category}.${displayName}`,
                displayName.toLowerCase(),
                displayName
              ];
              
              const isAllowed = possibleKeys.some(key => allowedComponents.includes(key));
              
              if (isAllowed) {
                console.log(`✅ [Smart Component Filter] Allowing component: ${uid} (${displayName})`);
              } else {
                console.log(`❌ [Smart Component Filter] Filtering out component: ${uid} (${displayName})`);
              }
              
              return isAllowed;
            });
            
            console.log(`🔍 [Smart Component Filter] Filtered ${ctx.body.data.length} → ${filteredComponents.length} components`);
            ctx.body.data = filteredComponents;
          } else {
            console.log('ℹ️ [Smart Component Filter] No filtering rules applied - showing all components');
          }
        } else {
          console.log('ℹ️ [Smart Component Filter] Not an Item edit page - skipping filter');
        }
      } catch (error) {
        console.error('❌ [Smart Component Filter] Middleware error:', error);
        // Continue with original response on error
      }
    } else {
      await next();
    }
  });
  
  console.log('✅ [Smart Component Filter] Server middleware initialized');
};

// Helper function to extract item ID from referer URL
function extractItemIdFromReferer(referer: string): string | null {
  // Strapi 5 uses documentId format like: /content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk
  const match = referer.match(/\/content-manager\/collection-types\/api::item\.item\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
