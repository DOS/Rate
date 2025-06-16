import { StrapiApp } from '@strapi/strapi/admin';
import { prefixPluginTranslations } from './utils/prefixPluginTranslations';
import { PLUGIN_ID } from './pluginId';
import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';

const name = 'Smart Component Filter';

export default {
  register(app: StrapiApp) {
    // Register custom field for component multi-select
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
        defaultMessage: 'Select multiple components with smart filtering',
      },
      components: {
        Input: async () =>
          import('./components/ComponentMultiSelectInput').then((module) => ({
            default: module.default,
          })),
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name,
    });
  },

  bootstrap(app: StrapiApp) {
    console.log('🎉 Smart Component Filter v3.0.0 - Bootstrap completed');
  },

  async registerTrads(app: StrapiApp) {
    const { locales } = app;

    const importedTrads = await Promise.all(
      (locales as string[]).map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, PLUGIN_ID),
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