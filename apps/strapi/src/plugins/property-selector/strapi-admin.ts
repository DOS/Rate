export default {
  register(app: any) {
    app.customFields.register({
      name: 'property-selector',
      pluginId: 'property-selector',
      type: 'json',
      intlLabel: {
        id: 'property-selector.label',
        defaultMessage: 'Property Components Selector',
      },
      intlDescription: {
        id: 'property-selector.description',
        defaultMessage: 'Select property components for this category',
      },
      icon: 'apps',
      components: {
        Input: async () => import('./admin/components/Input'),
      },
      options: {},
    });
  },
};
