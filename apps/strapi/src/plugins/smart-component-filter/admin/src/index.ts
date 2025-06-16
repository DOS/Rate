import { prefixPluginTranslations } from '@strapi/helper-plugin';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';

const name = pluginPkg.strapi.name;

export default {
  register(app: any) {
    app.addMenuLink({
      to: `/plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: name,
      },
      Component: async () => {
        const component = await import('./pages/App');
        return component;
      },
      permissions: [
        // Uncomment to set the permissions of the plugin here
        // {
        //   action: '', // the action name should be plugin::plugin-name.actionType
        //   subject: null,
        // },
      ],
    });

    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name,
    });
  },

  bootstrap(app: any) {
    // Override component picker for dynamic zones
    const originalComponentPicker = app.getPlugin('content-manager')?.apis?.getComponentPicker;
    
    if (originalComponentPicker) {
      app.getPlugin('content-manager').apis.getComponentPicker = async (
        componentCategory: string,
        dynamicZoneTarget?: string
      ) => {
        const originalComponents = await originalComponentPicker(componentCategory, dynamicZoneTarget);
        
        // Only filter for ItemField dynamic zone in Item content type
        if (dynamicZoneTarget === 'ItemField' && window.location.pathname.includes('/api::item.item/')) {
          return await filterComponentsForItem(originalComponents);
        }
        
        return originalComponents;
      };
    }

    // Alternative approach: Override the component picker modal
    const originalGetComponents = app.getPlugin('content-manager')?.apis?.getComponents;
    
    if (originalGetComponents) {
      app.getPlugin('content-manager').apis.getComponents = async () => {
        const originalComponents = await originalGetComponents();
        
        // Check if we're in Item edit page and dealing with ItemField
        if (window.location.pathname.includes('/api::item.item/') && 
            window.location.search.includes('ItemField')) {
          return await filterComponentsForItem(originalComponents);
        }
        
        return originalComponents;
      };
    }

    // Hook into component selection events
    app.registerHook('Admin/CM/pages/EditView/mutate-edit-view-layout', (layout: any) => {
      // Only modify layout for Item content type
      if (layout.contentType?.uid === 'api::item.item') {
        const itemFieldAttribute = layout.contentType.attributes?.ItemField;
        
        if (itemFieldAttribute?.type === 'dynamiczone') {
          // Store original components for filtering
          const originalComponents = itemFieldAttribute.components || [];
          
          // Add custom filtering logic
          itemFieldAttribute.components = originalComponents.filter((component: string) => {
            // This will be filtered dynamically based on ListingType rules
            return shouldIncludeComponent(component);
          });
        }
      }
      
      return layout;
    });
  },

  async registerTrads(app: any) {
    const { locales } = app;

    const importedTrads = await Promise.all(
      (locales as any[]).map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, pluginId),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return Promise.resolve(importedTrads);
  },
};

// Helper function to filter components based on ListingType rules
async function filterComponentsForItem(components: any[]): Promise<any[]> {
  try {
    // Extract item ID from URL
    const urlParts = window.location.pathname.split('/');
    const itemId = urlParts[urlParts.length - 1];
    
    if (!itemId || itemId === 'create') {
      return components; // Return all components for new items
    }

    // Fetch item data to get ListingType
    const response = await fetch(`/api/items/${itemId}?populate=ListingType.ItemField`);
    const itemData = await response.json();
    
    const listingType = itemData.data?.attributes?.ListingType?.data;
    if (!listingType) {
      return components; // Return all components if no ListingType
    }

    // Get allowed components from ListingType rules
    const itemFieldRules = listingType.attributes?.ItemField || [];
    const allowedComponents = itemFieldRules.map((rule: any) => rule.Component);
    
    // Filter components based on rules
    return components.filter((component: any) => {
      const componentName = component.uid || component.name || component;
      return allowedComponents.includes(componentName);
    });
    
  } catch (error) {
    console.error('Error filtering components:', error);
    return components; // Return original components on error
  }
}

// Helper function to check if component should be included
function shouldIncludeComponent(componentUid: string): boolean {
  // This will be enhanced with actual filtering logic
  // For now, return true to maintain existing functionality
  return true;
} 