import { StrapiApp } from '@strapi/strapi/admin';
import ComponentFilterCSS from './components/ComponentFilterCSS';
import { PLUGIN_ID as importedPluginId } from './pluginId';
import React from 'react';

const PLUGIN_ID = 'smart-component-filter';

export default {
  register(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin registering...');
    
    // Register the plugin
    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Smart Component Filter',
    });

    // Register Custom Field Type for Component Multi-Select
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'json',
      intlLabel: {
        id: `${PLUGIN_ID}.component-multi-select.label`,
        defaultMessage: 'Component Multi-Select',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.component-multi-select.description`, 
        defaultMessage: 'Select multiple components for ItemGroup and ReviewGroup',
      },
      components: {
        Input: async () => import('./components/ComponentMultiSelectInput'),
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
    });

    console.log('✅ Smart Component Filter plugin registered with custom field');
  },

  async bootstrap(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin bootstrapping...');
    
    try {
      // Inject component filter display in editView (works for both create and edit)
      app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
        name: 'smart-filter-display',
        Component: ComponentFilterCSS as any,
      });

      console.log('✅ Smart Component Filter plugin: Bootstrap completed for editView (create & edit)');
    } catch (error) {
      console.error('❌ Failed to bootstrap Smart Component Filter plugin:', error);
    }
  },
}; 