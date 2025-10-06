export default {
  routes: [
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
