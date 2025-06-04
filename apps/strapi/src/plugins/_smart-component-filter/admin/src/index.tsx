import { StrapiApp } from '@strapi/strapi/admin';
import ComponentFilterCSS from './components/ComponentFilterCSS';

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