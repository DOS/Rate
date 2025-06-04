import { StrapiApp } from '@strapi/strapi/admin';
import ComponentMultiSelectInput from './components/ComponentMultiSelectInput';

const PLUGIN_ID = 'smart-component-filter';

export default {
  register(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin registering with Strapi Design System...');
    
    // Register the plugin
    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Smart Component Filter',
    });

    // Register Custom Field Type for Component Multi-Select using Strapi Design System
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'json',
      intlLabel: {
        id: 'smart-component-filter.component-multi-select.label',
        defaultMessage: 'Component Multi-Select',
      },
      intlDescription: {
        id: 'smart-component-filter.component-multi-select.description', 
        defaultMessage: 'Select multiple components using Strapi Design System with native theme support',
      },
      components: {
        Input: async () => {
          return { default: ComponentMultiSelectInput as any };
        },
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
    });

    console.log('✅ Smart Component Filter plugin registered with Strapi Design System support');
  },

  bootstrap(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin bootstrapping...');
    console.log('✅ Smart Component Filter plugin: Bootstrap completed with native Strapi integration');
  },
}; 