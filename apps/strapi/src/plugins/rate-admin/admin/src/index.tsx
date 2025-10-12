
export default {
  register(app: any) {
    console.log('✅ Rate Admin admin panel registered');

    app.customFields.register({
      name: 'property-list-selector',
      pluginId: 'rate-admin',
      type: 'json',
      intlLabel: {
        id: 'rate-admin.property-list-selector.label',
        defaultMessage: 'Property Components',
      },
      intlDescription: {
        id: 'rate-admin.property-list-selector.description',
        defaultMessage: 'Select which property components to auto-generate for items',
      },
      // icon omitted to avoid deep-import resolution issues
      components: {
        Input: async () => import('./components/PropertyListInput'),
      },
      options: {
        base: [
          {
            sectionTitle: null,
            items: [
              {
                name: 'default',
                type: 'json',
                intlLabel: {
                  id: 'rate-admin.property-list-selector.default.label',
                  defaultMessage: 'Default selected components',
                },
                description: {
                  id: 'rate-admin.property-list-selector.default.description',
                  defaultMessage: 'Default value in JSON array, e.g. ["property.battery","property.camera"]',
                },
                defaultValue: '[]',
              },
            ],
          },
        ],
        advanced: [
          {
            sectionTitle: {
              id: 'global.settings',
              defaultMessage: 'Settings',
            },
            items: [
              {
                name: 'required',
                type: 'checkbox',
                intlLabel: {
                  id: 'rate-admin.property-list-selector.settings.requiredField',
                  defaultMessage: 'Required field',
                },
                description: {
                  id: 'rate-admin.property-list-selector.settings.requiredField.description',
                  defaultMessage: "You won't be able to create an entry if this field is empty",
                },
              },
              {
                name: 'private',
                type: 'checkbox',
                intlLabel: {
                  id: 'rate-admin.property-list-selector.settings.private',
                  defaultMessage: 'Private field',
                },
                description: {
                  id: 'rate-admin.property-list-selector.settings.private.description',
                  defaultMessage: 'This field will not show up in the API response',
                },
              },
              {
                name: 'min',
                type: 'number',
                intlLabel: {
                  id: 'rate-admin.property-list-selector.settings.minLength',
                  defaultMessage: 'Minimum items',
                },
                description: {
                  id: 'rate-admin.property-list-selector.settings.minLength.description',
                  defaultMessage: 'The minimum number of components (visual feedback only)',
                },
              },
              {
                name: 'max',
                type: 'number',
                intlLabel: {
                  id: 'rate-admin.property-list-selector.settings.maxLength',
                  defaultMessage: 'Maximum items',
                },
                description: {
                  id: 'rate-admin.property-list-selector.settings.maxLength.description',
                  defaultMessage: 'The maximum number of components (client-side enforcement only)',
                },
              },
            ],
          },
        ],
      },
    });
  },

  bootstrap(app: any) {
    console.log('🎨 Rate Admin admin panel bootstrapped');
  },
};
