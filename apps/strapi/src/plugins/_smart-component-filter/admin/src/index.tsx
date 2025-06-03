import { StrapiApp } from '@strapi/strapi/admin';
import ComponentFilter from './components/ComponentFilter';

const PLUGIN_ID = '_smart-component-filter';

export default {
  register(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin registering...');
    
    // Register the plugin first
    app.registerPlugin({
      id: PLUGIN_ID,
      name: 'Smart Component Filter',
    });
  },

  async bootstrap(app: StrapiApp) {
    console.log('🚀 Smart Component Filter plugin bootstrapping...');
    
    try {
      // Use the correct v5 injection method for content manager components  
      app.getPlugin('content-manager').injectComponent('editView', 'right-links', {
        name: 'smart-filter-display',
        Component: ComponentFilter,
      });

      console.log('✅ Smart Component Filter plugin: Component injection successful');
    } catch (error) {
      console.error('❌ Failed to inject Smart Component Filter plugin:', error);
    }
  },
}; 