/**
 * Seed script to create sample Listings
 * Run from Strapi directory: yarn strapi console
 * Then: await (require('./src/seed-listings.js'))()
 */

module.exports = async function seedListings() {
  // Sample listings data
  const listings = [
    {
      Title: "Vietcombank - Leading Banking Services",
      Slug: "vietcombank-banking",
      URL: "https://vietcombank.com.vn",
      Description: [
        {
          type: "paragraph",
          children: [
            {
              text: "Vietcombank is Vietnam's leading commercial bank, offering comprehensive banking solutions including personal banking, corporate banking, and digital services. Experience modern banking with 24/7 digital support.",
              type: "text"
            }
          ]
        }
      ],
      Status: "approved",
      isActive: true,
      locale: "en",
      publishedAt: new Date()
    },
    {
      Title: "ACB Bank - Digital Banking Excellence", 
      Slug: "acb-digital-banking",
      URL: "https://acb.com.vn",
      Description: [
        {
          type: "paragraph",
          children: [
            {
              text: "ACB is one of Vietnam's most innovative banks, pioneering digital banking solutions. Enjoy seamless online banking, instant transfers, and cutting-edge financial services.",
              type: "text"
            }
          ]
        }
      ],
      Status: "approved",
      isActive: true,
      locale: "en",
      publishedAt: new Date()
    },
    {
      Title: "Test Review Platform - Le Giang Anh",
      Slug: "test-review-platform",
      URL: "https://example.com/test",
      Description: [
        {
          type: "paragraph",
          children: [
            {
              text: "A test listing for the review platform featuring Le Giang Anh. This listing demonstrates the platform's capabilities for managing reviews and ratings.",
              type: "text"
            }
          ]
        }
      ],
      Status: "approved",
      isActive: true,
      locale: "en",
      publishedAt: new Date()
    }
  ];

  console.log('Starting to seed listings...');

  // Get categories and items
  const bankCategory = await strapi.db.query('api::category.category').findOne({
    where: { Name: 'Bank' }
  });

  const vietcombankItem = await strapi.db.query('api::item.item').findOne({
    where: { Title: 'Vietcombank' }
  });

  for (const [index, listing] of listings.entries()) {
    try {
      // Add relationships based on listing
      const dataWithRelations = { ...listing };
      
      if (index < 2 && bankCategory) {
        dataWithRelations.Category = bankCategory.id;
      }
      
      if (index === 0 && vietcombankItem) {
        dataWithRelations.Item = vietcombankItem.id;
      }

      const result = await strapi.db.query('api::listing.listing').create({
        data: dataWithRelations
      });

      console.log(`✅ Created listing: ${listing.Title} (ID: ${result.id})`);
    } catch (error) {
      console.error(`❌ Error creating listing: ${listing.Title}`, error);
    }
  }

  console.log('Seeding completed!');
}; 