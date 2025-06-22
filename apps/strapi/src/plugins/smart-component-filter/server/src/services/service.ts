import type { Core } from '@strapi/strapi';

const service = ({ strapi }: { strapi: Core.Strapi }) => ({
  getWelcomeMessage() {
    return 'Welcome to Strapi 🚀 - Smart Component Filter Plugin (Component Multi-Select only)';
  },

  // Get all available components in the system
  async getAvailableComponents() {
    try {
      strapi.log.info('🔍 [Smart Component Filter] Getting available components from Strapi registry');
      
      const components = strapi.components || {};
      const availableComponents: any[] = [];
      const categories = new Set<string>();

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
            categories.add(category);
          }
        }
      });

      strapi.log.info(`✅ Found ${availableComponents.length} available components`);
      
      return {
        components: availableComponents,
        totalCount: availableComponents.length,
        categories: Array.from(categories).sort()
      };
    } catch (error) {
      strapi.log.error('Error in getAvailableComponents service:', error);
      return {
        components: [],
        totalCount: 0,
        categories: []
      };
    }
  }
});

export default service;
