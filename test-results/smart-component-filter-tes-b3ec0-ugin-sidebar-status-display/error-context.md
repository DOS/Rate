# Test info

- Name: Smart Component Filter Plugin - Automated Testing >> Verify plugin sidebar status display
- Location: D:\Projects\JOY\Rate-New\smart-component-filter-test.spec.js:141:7

# Error details

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Log in' })

    at D:\Projects\JOY\Rate-New\smart-component-filter-test.spec.js:149:56
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
  116 |     await page.waitForTimeout(1000);
  117 |     
  118 |     // Print all console logs captured during test
  119 |     console.log('📝 Console logs captured during test:');
  120 |     consoleLogs.forEach((log, index) => {
  121 |       if (log.includes('COMPONENT PICKER') || log.includes('FILTER') || log.includes('Smart Component')) {
  122 |         console.log(`${index + 1}. ${log}`);
  123 |       }
  124 |     });
  125 |     
  126 |     // Final verification
  127 |     const pluginWorking = hasBasic && hasLocation && !hasViolation && hasViolationGroup && hasSocialContact;
  128 |     
  129 |     console.log(`
  130 | 🎯 AUTOMATED TEST RESULTS:
  131 | =========================
  132 | Plugin Detection: ${consoleLogs.some(log => log.includes('Smart Component') || log.includes('COMPONENT PICKER')) ? '✅ DETECTED' : '❌ NOT DETECTED'}
  133 | Bank Filtering: ${hasBasic && hasLocation && !hasViolation ? '✅ WORKING' : '❌ FAILED'}
  134 | Scammer Filtering: ${hasViolationGroup && hasSocialContact ? '✅ WORKING' : '❌ FAILED'}
  135 | Overall Status: ${pluginWorking ? '✅ PLUGIN WORKING CORRECTLY' : '❌ PLUGIN NEEDS FIXING'}
  136 |     `);
  137 |     
  138 |     expect(pluginWorking).toBe(true);
  139 |   });
  140 |   
  141 |   test('Verify plugin sidebar status display', async ({ page }) => {
  142 |     console.log('🤖 Testing plugin sidebar status...');
  143 |     
  144 |     await page.goto('http://localhost:1337/admin');
  145 |     
  146 |     // Login
  147 |     await page.getByLabel('Email').fill('joy@joy.vn');
  148 |     await page.getByLabel('Password').fill('!CkLdz_28@HH');
> 149 |     await page.getByRole('button', { name: 'Log in' }).click();
      |                                                        ^ Error: locator.click: Test timeout of 30000ms exceeded.
  150 |     
  151 |     await page.waitForLoadState('networkidle');
  152 |     
  153 |     // Look for Smart Component Filter widget in sidebar
  154 |     const sidebarContent = await page.textContent('body');
  155 |     const hasPluginWidget = sidebarContent.includes('Smart Component Filter') || 
  156 |                            sidebarContent.includes('Component Filter') ||
  157 |                            sidebarContent.includes('Plugin Status');
  158 |     
  159 |     console.log(`🔍 Plugin Sidebar Status: ${hasPluginWidget ? '✅ VISIBLE' : '❌ NOT FOUND'}`);
  160 |     
  161 |     expect(hasPluginWidget).toBe(true);
  162 |   });
  163 |   
  164 | }); 
```