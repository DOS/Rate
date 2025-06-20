/**
 * Category Lifecycle Hooks
 * Auto-sync Categories với Item.ListingType2 enum values
 */

export default {
  async afterCreate(event: any) {
    const { result } = event;
    console.log('📝 [Category] Created:', result.Name);
    await syncEnumValues();
  },

  async afterUpdate(event: any) {
    const { result } = event;
    console.log('📝 [Category] Updated:', result.Name);
    await syncEnumValues();
  },

  async afterDelete(event: any) {
    const { result } = event;
    console.log('📝 [Category] Deleted:', result.Name);
    await syncEnumValues();
  },
};

/**
 * Sync Categories với Item.ListingType2 enum values
 */
async function syncEnumValues() {
  try {
    // Get all active categories
    const categories = await strapi.entityService.findMany('api::category.category', {
      filters: { isActive: true },
      fields: ['Name', 'Slug'],
    });

    // Extract slugs for enum values
    const enumValues = categories.map((cat: any) => cat.Slug).filter(Boolean);
    
    console.log('🔄 [Category Sync] Found enum values:', enumValues);
    
    // Get current Item schema
    const itemSchema = strapi.contentTypes['api::item.item'];
    
    if (itemSchema && itemSchema.attributes.ListingType2) {
      // Update enum values in schema
      const currentEnum = itemSchema.attributes.ListingType2.enum || [];
      const hasChanges = JSON.stringify(currentEnum.sort()) !== JSON.stringify(enumValues.sort());
      
      if (hasChanges) {
        console.log('🔄 [Category Sync] Updating enum values...');
        
        // Update schema enum values
        (itemSchema.attributes.ListingType2 as any).enum = enumValues;
        
        console.log('✅ [Category Sync] Enum values updated successfully!');
        console.log('📋 [Category Sync] New values:', enumValues);
      } else {
        console.log('✅ [Category Sync] Enum values already up to date');
      }
    } else {
      console.log('⚠️  [Category Sync] ListingType2 field not found in Item schema');
    }
    
  } catch (error) {
    console.error('❌ [Category Sync] Error:', error);
  }
} 