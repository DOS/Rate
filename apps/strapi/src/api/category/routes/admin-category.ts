export default {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/categories/:id/type',
      handler: 'category.getType',
      config: {
        policies: ['admin::isAuthenticatedAdmin'],
      },
    },
    {
      method: 'GET',
      path: '/property-components/list',
      handler: 'property-components.list',
      config: {
        policies: [],
        auth: false,
      },
    },
  ],
}; 