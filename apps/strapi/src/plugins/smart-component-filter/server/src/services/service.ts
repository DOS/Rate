import type { Core } from '@strapi/strapi';

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  getWelcomeMessage() {
    return 'Welcome to Strapi 🚀';
  },

  // Get allowed components for a specific ListingType
  async getAllowedComponents(listingTypeId: string) {
    try {
      strapi.log.info(`🔍 Looking for ListingType with ID: ${listingTypeId}`);
      
      let listingType = null;
      
      const populateObj = { ItemField: true };

      // Helper to fetch via entityService with given filter
      const fetchListing = async (filterObj: any) => {
        const results = await strapi.entityService.findMany('api::listing-type.listing-type', {
          filters: filterObj,
          populate: populateObj,
          publicationState: 'preview',
          locale: 'en'
        });
        return Array.isArray(results) && results.length > 0 ? results[0] : null;
      };

      // 1) Try documentId
      listingType = await fetchListing({ documentId: { $eq: listingTypeId } });
      if (listingType) {
        strapi.log.info(`✅ Found ListingType by documentId`);
      }

      // 2) Try internal numeric/string id
      if (!listingType) {
        listingType = await fetchListing({ id: { $eq: listingTypeId } });
        if (listingType) {
          strapi.log.info(`✅ Found ListingType by id`);
        }
      }

      // 3) Try by Name (case-insensitive)
      if (!listingType) {
        listingType = await fetchListing({ Name: { $eqi: listingTypeId } });
        if (listingType) {
          strapi.log.info(`✅ Found ListingType by Name`);
        }
      }

      if (!listingType) {
        strapi.log.error(`❌ ListingType not found with ID: ${listingTypeId}`);
        return [];
      }

      strapi.log.info(`✅ Found ListingType: ${listingType.Name} (ID: ${listingTypeId})`);
      
      // Access ItemField custom field data
      const itemFieldData = listingType.ItemField;
      strapi.log.info(`🔍 Raw ItemField data:`, itemFieldData);
      strapi.log.info(`🔍 ItemField type:`, typeof itemFieldData);

      let allowedComponentUIDs = [];

      if (Array.isArray(itemFieldData)) {
        allowedComponentUIDs = itemFieldData;
        strapi.log.info(`✅ Using ItemField array data: ${allowedComponentUIDs.length} components`);
      } else if (typeof itemFieldData === 'string') {
        try {
          allowedComponentUIDs = JSON.parse(itemFieldData);
          strapi.log.info(`✅ Parsed ItemField string data: ${allowedComponentUIDs.length} components`);
        } catch (e) {
          strapi.log.error(`❌ Failed to parse ItemField string:`, e.message);
          allowedComponentUIDs = [];
        }
      } else {
        strapi.log.warn(`⚠️ ItemField data is not array or string for ${listingType.Name}, type: ${typeof itemFieldData}`);
        allowedComponentUIDs = [];
      }

      strapi.log.info(`🎯 Processed allowed components for ${listingType.Name}:`, allowedComponentUIDs);
      return allowedComponentUIDs;

    } catch (error) {
      strapi.log.error('Error in getAllowedComponents service:', error.message);
      return [];
    }
  },

  // Get all available components in the system
  async getAvailableComponents() {
    try {
      strapi.log.info('🔍 [Smart Component Filter] Getting available components from Strapi registry');
      
      const components = strapi.components || {};
      const availableComponents: any[] = [];

      // Get all registered components from Strapi
      Object.keys(components).forEach(componentUID => {
        const component = components[componentUID];
        if (component && component.info) {
          const [category, name] = componentUID.split('.');
          
          // Filter out irrelevant categories
          const excludedCategories = ['elements', 'sections', 'seo-utilities', 'utilities', 'shared', 'forms'];
          if (!excludedCategories.includes(category)) {
            availableComponents.push({
              uid: componentUID,
              category: category,
              displayName: component.info.displayName || name,
              icon: component.info.icon || 'cube'
            });
          }
        }
      });

      strapi.log.info(`✅ Found ${availableComponents.length} available components`);
      return availableComponents;
    } catch (error) {
      strapi.log.error('Error in getAvailableComponents service:', error);
      return [];
    }
  },

  // Helper: Validate if component UID exists
  async validateComponentUID(componentUID: string) {
    const components = strapi.components;
    return components.hasOwnProperty(componentUID);
  }
});

export default service;
