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
  ],
}; 