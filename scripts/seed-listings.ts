/**
 * Seed script to create sample Listings
 * Run with: node scripts/seed-listings.js
 */

async function seedListings() {
  const API_URL = 'http://localhost:1337/api';
  
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
      locale: "en"
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
      locale: "en"
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
      locale: "en"
    }
  ];

  console.log('Starting to seed listings...');

  for (const listing of listings) {
    try {
      const response = await fetch(`${API_URL}/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: listing })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ Created listing: ${listing.Title}`);
      } else {
        const error = await response.text();
        console.error(`❌ Failed to create listing: ${listing.Title}`);
        console.error(`Error: ${error}`);
      }
    } catch (error) {
      console.error(`❌ Error creating listing: ${listing.Title}`, error);
    }
  }

  console.log('Seeding completed!');
}

// Run the seed function
seedListings().catch(console.error); 