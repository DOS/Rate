module.exports = {
  routes: [
    {
      method: "GET",
      path: "/item-schema/:listingTypeKey",
      handler: "item.getSchema",
      config: {
        auth: false, // Allow public access for now
        policies: [],
        middlewares: [],
        description: "Get JSON schema for a specific listing type",
        tags: ["Item", "Schema"],
      },
    },
  ],
}
