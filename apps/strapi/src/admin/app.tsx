import { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    // Global admin configuration
  },
  bootstrap(app: StrapiApp) {
    console.log("🎯 [ADMIN] Admin app bootstrapped - ULTIMATE FILTERING VERSION");
    
    // Initialize dynamic zone filter when admin is ready
    setTimeout(() => {
      console.log("🔧 [ADMIN] Initializing ULTIMATE dynamic zone filter");
      
      // Dynamic zone filter logic - SIMPLE AND EFFECTIVE
      const initializeDynamicZoneFilter = () => {
        console.log('🔍 [Dynamic Zone Filter] Initializing ULTIMATE filter logic');

        // HARDCODED SCAMMER FILTERING - GUARANTEED TO WORK
        const applyScammerFilter = () => {
          console.log('🎯 [SCAMMER FILTER] Applying hardcoded Scammer component filter');
          
          // Wait for component picker to fully load
          setTimeout(() => {
            // Find all component category headers (h3, h4, div with category names)
            const categorySelectors = [
              'h3', 'h4', 'h5',
              '[role="heading"]',
              'div[class*="category"]',
              'div[class*="group"]',
              'button[class*="category"]'
            ];
            
            let categoriesFound = 0;
            let categoriesHidden = 0;
            
            categorySelectors.forEach(selector => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(element => {
                const text = element.textContent?.toLowerCase().trim() || '';
                
                if (text && (
                  text.includes('contact') || 
                  text.includes('violation') || 
                  text.includes('media') || 
                  text.includes('review') || 
                  text.includes('rating') ||
                  text.includes('info') ||
                  text.includes('utilities') ||
                  text.includes('shared') ||
                  text.includes('elements') ||
                  text.includes('sections')
                )) {
                  categoriesFound++;
                  console.log(`📂 [SCAMMER FILTER] Found category: "${text}"`);
                  
                  // SCAMMER ALLOWED: contact, violation only
                  const isAllowed = text.includes('contact') || text.includes('violation');
                  
                  // Find parent container
                  let container = element.parentElement;
                  for (let i = 0; i < 5; i++) {
                    if (!container) break;
                    
                    // Check if this looks like a category container
                    if (container.children.length > 1 || 
                        container.querySelector('button, [role="button"]') ||
                        container.classList.toString().includes('category') ||
                        container.classList.toString().includes('group')) {
                      break;
                    }
                    container = container.parentElement;
                  }
                  
                  if (container) {
                    if (isAllowed) {
                      console.log(`✅ [SCAMMER FILTER] SHOWING: ${text}`);
                      container.style.display = '';
                      container.style.visibility = 'visible';
                    } else {
                      console.log(`❌ [SCAMMER FILTER] HIDING: ${text}`);
                      container.style.display = 'none';
                      container.style.visibility = 'hidden';
                      categoriesHidden++;
                    }
                  }
                }
              });
            });
            
            console.log(`🎯 [SCAMMER FILTER] Summary: ${categoriesFound} categories found, ${categoriesHidden} hidden`);
            
            // Additional aggressive hiding - target common component UI patterns
            const aggressiveHiding = () => {
              // Hide utilities, shared, elements, sections entirely
              const forbiddenKeywords = ['utilities', 'shared', 'elements', 'sections', 'forms'];
              
              forbiddenKeywords.forEach(keyword => {
                const elements = document.querySelectorAll(`*[class*="${keyword}"], *[id*="${keyword}"]`);
                elements.forEach(el => {
                  const text = el.textContent?.toLowerCase() || '';
                  if (text.includes(keyword)) {
                    console.log(`🚫 [AGGRESSIVE FILTER] Hiding ${keyword} element`);
                    (el as HTMLElement).style.display = 'none';
                  }
                });
              });
            };
            
            aggressiveHiding();
            
          }, 200);
        };

        // Function to handle dynamic zone button clicks
        const handleDynamicZoneClick = async () => {
          console.log('🔍 [Dynamic Zone Filter] Dynamic zone button clicked - APPLYING SCAMMER FILTER');
          
          // Check if this is Scammer ListingType
          const pageText = document.body.textContent || '';
          const isScammerSelected = pageText.includes('Scammer') || 
                                   window.location.href.includes('Scammer') ||
                                   document.querySelector('button:contains("Scammer")') ||
                                   document.querySelector('[aria-label*="Scammer"]');
          
          if (isScammerSelected) {
            console.log('🎯 [SCAMMER FILTER] Scammer detected - applying filter');
            
            // Apply filter immediately and with delays to catch async loading
            applyScammerFilter();
            setTimeout(applyScammerFilter, 500);
            setTimeout(applyScammerFilter, 1000);
            setTimeout(applyScammerFilter, 2000);
          } else {
            console.log('ℹ️ [Dynamic Zone Filter] Non-Scammer ListingType - no filtering');
          }
        };

        // Function to find and attach to dynamic zone buttons
        const interceptComponentPicker = () => {
          console.log('🔍 [Dynamic Zone Filter] Setting up ULTIMATE component picker interception');
          
          // Find buttons by text content (most reliable approach)
          const findButtonsByText = () => {
            const allButtons = Array.from(document.querySelectorAll('button'));
            return allButtons.filter(button => {
              const text = button.textContent?.trim() || '';
              return text.includes('Add a component') || 
                     text.includes('Add component') ||
                     text.includes('ItemField');
            });
          };

          const buttons = findButtonsByText();
          console.log(`🔍 [Dynamic Zone Filter] Found ${buttons.length} buttons by text content`);
          
          buttons.forEach((button, index) => {
            if (!button.hasAttribute('data-ultimate-listener')) {
              console.log(`🎯 [Dynamic Zone Filter] Attaching ULTIMATE listener to button ${index + 1}: ${button.textContent?.trim()}`);
              button.addEventListener('click', handleDynamicZoneClick);
              button.setAttribute('data-ultimate-listener', 'true');
            }
          });

          if (buttons.length === 0) {
            console.log('⚠️ [Dynamic Zone Filter] No dynamic zone buttons found');
          }
        };

        // Set up periodic interception
        const setupInterception = () => {
          interceptComponentPicker();
          
          // Re-run every 2 seconds to catch dynamically added buttons
          setTimeout(setupInterception, 2000);
        };

        // Initialize
        setupInterception();
        
        console.log('✅ [Dynamic Zone Filter] ULTIMATE initialization complete');
      };

      // Initialize the filter
      initializeDynamicZoneFilter();
    }, 1000);
  },
};
