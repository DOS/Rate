import { StrapiApp } from '@strapi/strapi/admin';
import { PLUGIN_ID } from './pluginId';
import { Initializer } from './components/Initializer';
import { DynamicCategoryEnum } from './components/DynamicCategoryEnum';

const name = 'Smart Component Filter V3.1';

export default {
  register(app: StrapiApp) {
    console.log('🎯 [Smart Component Filter V3.1] Register function started');
    
    // Register existing custom field for component multi-select
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'string',
      intlLabel: {
        id: `${PLUGIN_ID}.component-multi-select.label`,
        defaultMessage: 'Component Multi Select',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.component-multi-select.description`,
        defaultMessage: 'Select multiple components for dynamic zone filtering',
      },
      components: {
        Input: async () => import('./components/ComponentMultiSelectInput').then((module) => ({ default: module.default })),
      },
    });

    // Register NEW Dynamic Category Enum custom field
    app.customFields.register({
      name: 'dynamic-category-enum',
      pluginId: PLUGIN_ID,
      type: 'enumeration',
      intlLabel: {
        id: `${PLUGIN_ID}.dynamic-category-enum.label`,
        defaultMessage: 'Dynamic Category Enum',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.dynamic-category-enum.description`,
        defaultMessage: 'Dynamic enumeration field populated from Categories API - perfect for Conditional Fields',
      },
      components: {
        Input: async () => import('./components/DynamicCategoryEnum').then((module) => ({ default: module.DynamicCategoryEnum })),
      },
    });

    console.log('✅ [Smart Component Filter V3.1] Both custom fields registered successfully');

    const plugin = {
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name,
    };

    app.registerPlugin(plugin);
  },

  bootstrap(app: StrapiApp) {
    console.log('🚀 [Smart Component Filter V3.1] Bootstrap function started');
    console.log('✅ [Smart Component Filter V3.1] Bootstrap completed successfully');
  },

  async registerTrads(app: any) {
    const { locales } = app;

    const importedTrads = await Promise.all(
      (locales as string[]).map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: data,
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