import { useEffect } from 'react';

/**
 * Hook to filter dynamic zone components based on listing type selection
 * This intercepts the dynamic zone component picker and filters components
 * using the Smart Component Filter API
 */
export function useDynamicZoneFilter() {
  useEffect(() => {
    console.log('🔍 [Dynamic Zone Filter] Hook initialized');

    // Function to filter components based on listing type
    const filterComponents = async (listingTypeId: string) => {
      try {
        console.log(`🔍 [Dynamic Zone Filter] Filtering for listing type: ${listingTypeId}`);
        
        const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`);
        const data = await response.json();
        
        if (data.success) {
          console.log(`✅ [Dynamic Zone Filter] Found ${data.data.totalCount} allowed components:`, data.data.allowedComponents);
          return data.data.allowedComponents;
        } else {
          console.warn('❌ [Dynamic Zone Filter] API error:', data.error);
          return null;
        }
      } catch (error) {
        console.error('❌ [Dynamic Zone Filter] Fetch error:', error);
        return null;
      }
    };

    // Function to intercept dynamic zone component picker
    const interceptComponentPicker = () => {
      // Look for dynamic zone add component buttons
      const dynamicZoneButtons = document.querySelectorAll('[data-strapi-field-type="dynamiczone"] button, .dynamic-zone button, [aria-label*="component"] button');
      
      dynamicZoneButtons.forEach((button) => {
        if (button.textContent?.includes('Add component') || button.textContent?.includes('Thêm component')) {
          console.log('🎯 [Dynamic Zone Filter] Found dynamic zone button:', button);
          
          // Add click listener to filter components
          button.addEventListener('click', async (event) => {
            console.log('🔍 [Dynamic Zone Filter] Dynamic zone button clicked');
            
            // Get current listing type from form
            const listingTypeSelect = document.querySelector('select[name*="ListingType"], select[name*="listingType"], input[name*="ListingType"]') as HTMLSelectElement | HTMLInputElement;
            
            if (listingTypeSelect) {
              const listingTypeId = listingTypeSelect.value;
              console.log(`🔍 [Dynamic Zone Filter] Current listing type ID: ${listingTypeId}`);
              
              if (listingTypeId) {
                // Get allowed components
                const allowedComponents = await filterComponents(listingTypeId);
                
                if (allowedComponents) {
                  // Wait for component picker modal to appear
                  setTimeout(() => {
                    hideDisallowedComponents(allowedComponents);
                  }, 100);
                }
              }
            } else {
              console.warn('🔍 [Dynamic Zone Filter] ListingType field not found');
            }
          });
        }
      });
    };

    // Function to hide disallowed components in picker modal
    const hideDisallowedComponents = (allowedComponents: string[]) => {
      console.log('🔍 [Dynamic Zone Filter] Hiding disallowed components...');
      
      // Find component picker modal/dropdown
      const componentOptions = document.querySelectorAll('.component-picker button, .component-list button, [data-component-uid]');
      
      componentOptions.forEach((option) => {
        const componentUid = option.getAttribute('data-component-uid') || 
                           option.textContent?.toLowerCase().replace(/\s+/g, '.') || '';
        
        if (componentUid && !allowedComponents.includes(componentUid)) {
          console.log(`🚫 [Dynamic Zone Filter] Hiding component: ${componentUid}`);
          (option as HTMLElement).style.display = 'none';
        } else {
          console.log(`✅ [Dynamic Zone Filter] Showing component: ${componentUid}`);
          (option as HTMLElement).style.display = '';
        }
      });
    };

    // Initialize component picker interception
    interceptComponentPicker();

    // Re-run interception when DOM changes (for SPA navigation)
    const observer = new MutationObserver(() => {
      interceptComponentPicker();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Cleanup
    return () => {
      observer.disconnect();
    };
  }, []);
}

export default useDynamicZoneFilter; 