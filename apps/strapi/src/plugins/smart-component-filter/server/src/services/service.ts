import type { Core } from '@strapi/strapi';

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  getWelcomeMessage() {
    return 'Welcome to Strapi 🚀';
  },

  // Get allowed components for a specific ListingType
  async getAllowedComponents(listingTypeId: string | number) {
    try {
      // Convert to number if it's a string
      const id = typeof listingTypeId === 'string' ? parseInt(listingTypeId, 10) : listingTypeId;
      
      if (isNaN(id)) {
        throw new Error(`Invalid ListingType ID: ${listingTypeId}`);
      }

      // Get the ListingType with its itemGroup field
      const listingType = await strapi.entityService.findOne(
        'api::listing-type.listing-type',
        id,
        {
          fields: ['ItemGroup', 'Name'],
          populate: {}
        }
      );

      if (!listingType) {
        throw new Error(`ListingType with ID ${id} not found`);
      }

      // Ensure ItemGroup is an array and filter out any invalid entries
      const allowedComponentUIDs = Array.isArray(listingType.ItemGroup) 
        ? listingType.ItemGroup.filter(Boolean)
        : [];

      return {
        listingType: {
          id: id,
          name: listingType.Name || `ListingType ${id}`
        },
        allowedComponents: allowedComponentUIDs,
        totalCount: allowedComponentUIDs.length
      };
    } catch (error) {
      strapi.log.error('Error in getAllowedComponents service:', error);
      throw error;
    }
  },

  // Get all available components in the system
  async getAvailableComponents() {
    try {
      // Get all components from Strapi's component registry
      const components = strapi.components;
      const componentList = [];

      // Convert components object to array with metadata
      for (const [uid, component] of Object.entries(components)) {
        componentList.push({
          uid,
          displayName: component.info?.displayName || uid,
          category: component.category || 'uncategorized',
          icon: component.info?.icon || 'cube',
          attributes: Object.keys(component.attributes || {})
        });
      }

      return {
        components: componentList,
        totalCount: componentList.length,
        categories: [...new Set(componentList.map(c => c.category))]
      };
    } catch (error) {
      strapi.log.error('Error getting available components:', error);
      throw error;
    }
  },

  // Helper: Validate if component UID exists
  async validateComponentUID(componentUID: string) {
    const components = strapi.components;
    return components.hasOwnProperty(componentUID);
  }
});

export default service;
