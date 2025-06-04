# Test info

- Name: Smart Component Filter Plugin - Automated Testing >> Login and verify Smart Component Filter plugin functionality
- Location: D:\Projects\JOY\Rate-New\smart-component-filter-test.spec.js:5:7

# Error details

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Log in' })

    at D:\Projects\JOY\Rate-New\smart-component-filter-test.spec.js:15:56
```

# Page snapshot

```yaml
- link "Skip to content":
  - /url: "#main-content"
- navigation:
  - img "Application logo"
  - text: Strapi DashboardWorkplace
  - separator
  - list:
    - listitem:
      - link "Home":
        - /url: /admin
    - listitem:
      - link "Content Manager":
        - /url: /admin/content-manager
    - listitem:
      - link "Media Library":
        - /url: /admin/plugins/upload
    - listitem:
      - link "Content-Type Builder":
        - /url: /admin/plugins/content-type-builder
    - listitem:
      - link "SEO":
        - /url: /admin/plugins/seo
    - listitem:
      - link "Marketplace":
        - /url: /admin/marketplace
    - listitem:
      - link "Settings":
        - /url: /admin/settings
  - button "J JOY"
- main:
  - heading "Hello Anh" [level=1]
  - paragraph: Welcome to your administration panel
  - heading "3 steps to get started" [level=2]
  - text: "1"
  - heading "🧠 Build the content structure" [level=3]
  - link "Go to the Content type Builder":
    - /url: /admin/plugins/content-type-builder
  - text: "2"
  - heading "⚡️ What would you like to share with the world?" [level=3]
  - text: "3"
  - heading "🚀 See content in action" [level=3]
  - button "Skip the tour"
  - region "Last edited entries":
    - heading "Last edited entries" [level=2]
    - main:
      - grid:
        - rowgroup:
          - row "Scammer A Item published yesterday Edit":
            - gridcell "Scammer A"
            - gridcell "Item"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk?plugins[i18n][locale]=en
          - row "Test Category Category published yesterday Edit":
            - gridcell "Test Category"
            - gridcell "Category"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::category.category/hga0bri3sp2rn20gi9r74yw8?plugins[i18n][locale]=en
          - row "Scammer Listing Type published yesterday Edit":
            - gridcell "Scammer"
            - gridcell "Listing Type"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::listing-type.listing-type/udpgtzhmbomsygmsxb7u0cuz?plugins[i18n][locale]=en
          - row "Bank Listing Type published 2 days ago Edit":
            - gridcell "Bank"
            - gridcell "Listing Type"
            - gridcell "published":
              - status "published": Published
            - gridcell "2 days ago":
              - time: 2 days ago
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::listing-type.listing-type/o86wqkhdji9lnpcgpeffrlhv?plugins[i18n][locale]=en
  - region "Last published entries":
    - heading "Last published entries" [level=2]
    - main:
      - grid:
        - rowgroup:
          - row "Scammer A Item published yesterday Edit":
            - gridcell "Scammer A"
            - gridcell "Item"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk?plugins[i18n][locale]=en
          - row "Test Category Category published yesterday Edit":
            - gridcell "Test Category"
            - gridcell "Category"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::category.category/hga0bri3sp2rn20gi9r74yw8?plugins[i18n][locale]=en
          - row "Scammer Listing Type published yesterday Edit":
            - gridcell "Scammer"
            - gridcell "Listing Type"
            - gridcell "published":
              - status "published": Published
            - gridcell "yesterday":
              - time: yesterday
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::listing-type.listing-type/udpgtzhmbomsygmsxb7u0cuz?plugins[i18n][locale]=en
          - row "Bank Listing Type published 2 days ago Edit":
            - gridcell "Bank"
            - gridcell "Listing Type"
            - gridcell "published":
              - status "published": Published
            - gridcell "2 days ago":
              - time: 2 days ago
            - gridcell "Edit":
              - link "Edit":
                - /url: /admin/content-manager/collection-types/api::listing-type.listing-type/o86wqkhdji9lnpcgpeffrlhv?plugins[i18n][locale]=en
- log
- status
- alert
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('Smart Component Filter Plugin - Automated Testing', () => {
   4 |   
   5 |   test('Login and verify Smart Component Filter plugin functionality', async ({ page, browser }) => {
   6 |     console.log('🤖 Starting automated test for Smart Component Filter plugin...');
   7 |     
   8 |     // Navigate to Strapi admin
   9 |     await page.goto('http://localhost:1337/admin');
   10 |     console.log('✅ Navigated to Strapi admin');
   11 |     
   12 |     // Login với credentials từ memory
   13 |     await page.getByLabel('Email').fill('joy@joy.vn');
   14 |     await page.getByLabel('Password').fill('!CkLdz_28@HH');
>  15 |     await page.getByRole('button', { name: 'Log in' }).click();
      |                                                        ^ Error: locator.click: Test timeout of 30000ms exceeded.
   16 |     console.log('✅ Login completed');
   17 |     
   18 |     // Wait for dashboard load
   19 |     await page.waitForLoadState('networkidle');
   20 |     await expect(page.getByText('Welcome')).toBeVisible({ timeout: 10000 });
   21 |     console.log('✅ Dashboard loaded successfully');
   22 |     
   23 |     // Check for Smart Component Filter plugin in sidebar
   24 |     const sidebarText = await page.textContent('body');
   25 |     console.log('📍 Checking for Smart Component Filter plugin...');
   26 |     
   27 |     // Navigate to Content Manager
   28 |     await page.click('text=Content Manager');
   29 |     await page.waitForLoadState('networkidle');
   30 |     console.log('✅ Navigated to Content Manager');
   31 |     
   32 |     // Click on Items collection
   33 |     await page.click('text=Items');
   34 |     await page.waitForLoadState('networkidle');
   35 |     console.log('✅ Opened Items collection');
   36 |     
   37 |     // Create new entry để test component filtering
   38 |     await page.click('text=Create new entry');
   39 |     await page.waitForLoadState('networkidle');
   40 |     console.log('✅ Opened create new Item form');
   41 |     
   42 |     // Test Bank ListingType filtering
   43 |     console.log('🧪 Testing Bank ListingType component filtering...');
   44 |     
   45 |     // Select Bank from ListingType dropdown
   46 |     await page.click('[name="listing_type"]');
   47 |     await page.waitForTimeout(1000);
   48 |     await page.click('text=Bank');
   49 |     await page.waitForTimeout(2000);
   50 |     console.log('✅ Selected Bank ListingType');
   51 |     
   52 |     // Click Add component button to open modal
   53 |     await page.click('text=Add component');
   54 |     await page.waitForTimeout(3000);
   55 |     console.log('✅ Opened component picker modal');
   56 |     
   57 |     // Capture console logs during modal interaction
   58 |     const consoleLogs = [];
   59 |     page.on('console', msg => {
   60 |       consoleLogs.push(msg.text());
   61 |     });
   62 |     
   63 |     // Verify Bank filtering: should only see contact group with Basic + Location
   64 |     const modalContent = await page.textContent('.component-picker-modal, [role="dialog"], .modal-content');
   65 |     console.log('📋 Modal content captured for Bank filtering');
   66 |     
   67 |     // Check if only expected components are visible
   68 |     const hasBasic = modalContent.includes('Basic');
   69 |     const hasLocation = modalContent.includes('Location');
   70 |     const hasViolation = modalContent.includes('violation');
   71 |     const hasReview = modalContent.includes('review');
   72 |     
   73 |     console.log(`🔍 Bank Filtering Results:
   74 |       - Has Basic: ${hasBasic}
   75 |       - Has Location: ${hasLocation}  
   76 |       - Has Violation (should be false): ${hasViolation}
   77 |       - Has Review (should be false): ${hasReview}`);
   78 |     
   79 |     // Close modal
   80 |     await page.keyboard.press('Escape');
   81 |     await page.waitForTimeout(1000);
   82 |     console.log('✅ Closed component modal');
   83 |     
   84 |     // Test Scammer ListingType filtering
   85 |     console.log('🧪 Testing Scammer ListingType component filtering...');
   86 |     
   87 |     // Select Scammer from ListingType dropdown
   88 |     await page.click('[name="listing_type"]');
   89 |     await page.waitForTimeout(1000);
   90 |     await page.click('text=Scammer');
   91 |     await page.waitForTimeout(2000);
   92 |     console.log('✅ Selected Scammer ListingType');
   93 |     
   94 |     // Click Add component button again
   95 |     await page.click('text=Add component');
   96 |     await page.waitForTimeout(3000);
   97 |     console.log('✅ Opened component picker modal for Scammer');
   98 |     
   99 |     // Verify Scammer filtering: should see violation + contact.Social + review
  100 |     const scammerModalContent = await page.textContent('.component-picker-modal, [role="dialog"], .modal-content');
  101 |     console.log('📋 Modal content captured for Scammer filtering');
  102 |     
  103 |     const hasViolationGroup = scammerModalContent.includes('violation');
  104 |     const hasSocialContact = scammerModalContent.includes('Social');
  105 |     const hasReviewGroup = scammerModalContent.includes('review');
  106 |     const hasBasicInScammer = scammerModalContent.includes('Basic');
  107 |     
  108 |     console.log(`🔍 Scammer Filtering Results:
  109 |       - Has Violation group: ${hasViolationGroup}
  110 |       - Has Social contact: ${hasSocialContact}
  111 |       - Has Review group: ${hasReviewGroup}
  112 |       - Has Basic (should be false): ${hasBasicInScammer}`);
  113 |     
  114 |     // Close modal
  115 |     await page.keyboard.press('Escape');
```