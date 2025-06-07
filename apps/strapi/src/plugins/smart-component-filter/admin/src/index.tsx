import { StrapiApp } from '@strapi/strapi/admin';
import ComponentMultiSelectInput from './components/ComponentMultiSelectInput';
import SimpleInput from './components/SimpleInput';

const PLUGIN_ID = 'smart-component-filter';

// Configuration: Switch between implementation approaches  
const PLUGIN_CONFIG = {
  // 'hardcoded' = Fast, stable, manual rules
  // 'api' = Dynamic, flexible, requires API permissions
  mode: 'api' as 'hardcoded' | 'api'
};

// API integration functions
const getListingTypeFromItem = async (): Promise<string | null> => {
  try {
    // Get current URL to extract item ID
    const url = window.location.href;
    const itemIdMatch = url.match(/\/api::item\.item\/([^/?]+)/);
    
    if (!itemIdMatch) {
      console.log('❌ No item ID found in URL');
      return null;
    }
    
    const itemId = itemIdMatch[1];
    console.log('🔍 Found item ID:', itemId);
    
    // Fetch item data using the correct Strapi API endpoint
    const response = await fetch(`/api/items/${itemId}?populate=ListingType`, {
      method: 'GET',
      credentials: 'include', // Include cookies for session authentication
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.log('❌ Failed to fetch item data:', response.status, response.statusText);
      return null;
    }
    
    const itemData = await response.json();
    console.log('📦 Item data:', itemData);
    
    // Extract listing type ID from the item data
    const listingType = itemData?.data?.ListingType;
    if (!listingType || !listingType.id) {
      console.log('❌ No listing type found in item data');
      return null;
    }
    
    const listingTypeId = listingType.id.toString();
    console.log('✅ Found listing type ID:', listingTypeId);
    
    return listingTypeId;
  } catch (error) {
    console.log('❌ Error fetching listing type from item:', error);
    return null;
  }
};

const fetchAllowedComponents = async (listingTypeId: string): Promise<string[]> => {
  try {
    console.log('🔍 Fetching allowed components for listing type:', listingTypeId);
    
    // Get auth token from localStorage or session
    const token = localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`, {
      method: 'GET',
      headers,
      credentials: 'include', // Include cookies for session-based auth
    });
    
    if (!response.ok) {
      console.error('❌ API call failed:', response.status, response.statusText);
      return [];
    }
    
    const data = await response.json();
    console.log('📦 API response:', data);
    
    if (data.success && data.data && data.data.allowedComponents) {
      console.log('✅ Allowed components:', data.data.allowedComponents);
      return data.data.allowedComponents;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Error fetching allowed components:', error);
    return [];
  }
};

// Debouncing variables
let filteringTimeout: NodeJS.Timeout | null = null;
let lastFilterTime = 0;
const FILTER_DEBOUNCE_MS = 500; // 500ms debounce

// Function to filter component picker based on listing type
const filterComponentPicker = async () => {
  const now = Date.now();
  
  // Debounce filtering to prevent excessive calls
  if (now - lastFilterTime < FILTER_DEBOUNCE_MS) {
    console.log('🚫 Filtering debounced - too soon since last filter');
    return;
  }
  
  lastFilterTime = now;
  console.log('🎯 Starting component picker filtering...');
  console.log('🔍 Current URL:', window.location.pathname);
  
  try {
    // Check if we're on create page or edit page
    const isCreatePage = window.location.pathname.includes('/create');
    console.log('📋 Is create page:', isCreatePage);
    console.log('📋 Full pathname:', window.location.pathname);
    
    let listingTypeId: string | null = null;
    
    if (isCreatePage) {
      // For create page, get ListingType from form state
      listingTypeId = await getListingTypeFromFormState();
      console.log('🎯 ListingType from form state:', listingTypeId);
    } else {
      // For edit page, get item ID from URL first
      const itemId = getItemIdFromUrl();
      if (!itemId) {
        console.log('❌ No item ID found in URL for edit page');
        return;
      }
      
      console.log(`🔍 Found item ID: ${itemId}`);
      
      // Try to get listing type from form state first (for unsaved changes)
      listingTypeId = await getListingTypeFromFormState();
      console.log('🎯 ListingType from form state:', listingTypeId);
    }
    
    if (!listingTypeId) {
      console.log('❌ No listing type ID found, cannot filter components');
      return;
    }
    
    console.log(`✅ Found listing type ID: ${listingTypeId}`);
    
    // Get allowed components from API
    console.log('📡 Making API call to fetch allowed components...');
    const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });
    
    console.log('📡 API response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ Failed to fetch allowed components:', response.status, response.statusText);
      console.log('⚠️ Showing all components due to API failure');
      return;
    }
    
    const data = await response.json();
    console.log('📦 Full API response:', JSON.stringify(data, null, 2));
    
    if (!data.success || !data.data) {
      console.error('❌ Invalid API response format:', data);
      console.log('⚠️ Showing all components due to invalid response');
      return;
    }
    
    const allowedComponents = data.data.allowedComponents || [];
    console.log('✅ Extracted allowed components:', allowedComponents);
    console.log('📊 Number of allowed components:', allowedComponents.length);
    
    if (allowedComponents.length === 0) {
      console.log('🚫 No allowed components found - HIDING ALL COMPONENTS');
      // When no components are allowed, hide all components
      applyComponentFiltering([]);
      return;
    }
    
    // Apply filtering logic
    console.log('🎯 Starting component filtering with allowed components:', allowedComponents);
    applyComponentFiltering(allowedComponents);
    
  } catch (error) {
    console.error('❌ Error in filterComponentPicker:', error);
  }
};

// Observer to detect when component picker opens
const setupComponentPickerObserver = () => {
  console.log('👀 Setting up component picker observer...');
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          // Log all new elements for debugging
          if (element.tagName) {
            console.log(`🔍 New element added: ${element.tagName}${element.className && typeof element.className === 'string' ? '.' + element.className.replace(/\s+/g, '.') : element.className ? '.' + Array.from(element.classList).join('.') : ''}${element.id ? '#' + element.id : ''}`);
          }
          
          // Enhanced detection strategies for Dynamic Zone component picker
          const detectionStrategies = [
            // Dynamic Zone specific selectors
            () => element.querySelector && element.querySelector('[data-strapi-field-type="dynamiczone"]'),
            () => element.querySelector && element.querySelector('[class*="DynamicZone"]'),
            () => element.querySelector && element.querySelector('[class*="ComponentPicker"]'),
            () => element.querySelector && element.querySelector('[class*="component-picker"]'),
            
            // Modal/Dialog detection
            () => element.querySelector && element.querySelector('[role="dialog"]'),
            () => element.querySelector && element.querySelector('[class*="Modal"]'),
            () => element.querySelector && element.querySelector('[class*="modal"]'),
            
            // Component category headers
            () => element.querySelector && element.querySelector('h3[role="button"]'),
            () => element.querySelector && element.querySelector('h2[role="button"]'),
            () => element.querySelector && element.querySelector('button[role="button"]'),
            
            // Component selection buttons
            () => element.querySelector && element.querySelector('[data-testid*="component"]'),
            () => element.querySelector && element.querySelector('[class*="picker"]'),
            () => element.querySelector && element.querySelector('[class*="Component"]'),
            
            // Text-based detection for component categories
            () => element.textContent && ['contact', 'violation', 'business', 'content', 'info', 'media', 'review', 'rating'].some(cat => 
              element.textContent!.toLowerCase().includes(cat)
            ),
            
            // Direct element matching
            () => element.matches && element.matches('[data-strapi-field-type="dynamiczone"]'),
            () => element.matches && element.matches('[role="dialog"]'),
            () => element.matches && element.matches('h3[role="button"]'),
            () => element.matches && element.matches('h2[role="button"]'),
            () => element.matches && element.matches('button[role="button"]'),
            
            // Check for "Add component" button or similar
            () => element.textContent && element.textContent.toLowerCase().includes('add component'),
            () => element.textContent && element.textContent.toLowerCase().includes('choose component'),
            () => element.textContent && element.textContent.toLowerCase().includes('select component'),
          ];
          
          for (let i = 0; i < detectionStrategies.length; i++) {
            try {
              if (detectionStrategies[i]()) {
                console.log(`🎯 Component picker detected using strategy ${i + 1}, element:`, element);
                console.log(`📝 Element content preview:`, element.textContent?.substring(0, 100));
                
                // Filter quickly after picker detection
                setTimeout(() => {
                  console.log('🎯 Now filtering after strategy detection...');
                  filterComponentPicker();
                }, 50);
                return;
              }
            } catch (e) {
              // Continue to next strategy
            }
          }
        }
      });
    });
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Additional observer specifically for dialog/modal appearances
  const dialogObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          
          // Check if this is a dialog/modal containing component picker
          if (element.matches && (
            element.matches('[role="dialog"]') ||
            element.matches('[role="modal"]') ||
            element.matches('.modal') ||
            element.matches('[data-testid*="modal"]') ||
            element.querySelector('[role="dialog"]') ||
            element.querySelector('.modal')
          )) {
            console.log('🎯 Dialog/Modal detected, checking for component picker...');
            
            // Check if it contains component picker content
            const hasComponentPicker = element.textContent && (
              element.textContent.includes('Pick one component') ||
              element.textContent.includes('contact') ||
              element.textContent.includes('violation') ||
              element.textContent.includes('Choose component')
            );
            
            if (hasComponentPicker) {
              console.log('🎯🎯🎯 OPTIMIZED VERSION: Component picker dialog detected, filtering quickly...');
              // Filter quickly for better user experience
              setTimeout(() => {
                console.log('🎯 Now filtering component picker after render...');
                filterComponentPicker();
              }, 50);
            }
          }
        }
      });
    });
  });
  
  dialogObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('✅ Component picker observer active');
  
  // Additional observer to watch for form changes
  const formObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Check if any form elements changed
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        // Look for ListingType relation changes
        const target = mutation.target as Element;
        if (target && (
          target.matches && target.matches('[name="ListingType"]') ||
          target.closest && target.closest('[name="ListingType"]') ||
          target.textContent?.includes('Bank') ||
          target.textContent?.includes('Scammer') ||
          target.textContent?.includes('Business')
        )) {
          console.log('🔄 MUTATION: Detected potential ListingType change');
          setTimeout(() => {
            checkForListingTypeChange();
          }, 100);
        }
      }
    });
  });
  
  // Start observing form changes
  formObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'data-value', 'aria-selected']
  });
  
  // Also set up click event listeners for Dynamic Zone add buttons
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target && target.textContent) {
      const text = target.textContent.toLowerCase();
      if (text.includes('add component') || text.includes('choose component') || text.includes('select component')) {
        console.log('🎯 Dynamic Zone add button clicked, filtering quickly...');
        // Filter quickly after button click
        setTimeout(() => {
          filterComponentPicker();
        }, 50);
      }
    }
  });
  
  // Set up listener for ListingType selection changes
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target && target.name === 'ListingType') {
      console.log('🎯 ListingType selection changed, value:', target.value);
      // Store the selected ListingType for later use
      (window as any).selectedListingType = target.value;
      
      // Clear any existing component picker cache/state
      console.log('🔄 Clearing component picker cache due to ListingType change');
      (window as any).componentPickerCache = null;
      
      // If component picker is currently open, re-filter it
      const existingPicker = document.querySelector('[role="dialog"]') || 
                            document.querySelector('.modal') ||
                            document.querySelector('[data-testid="component-picker"]');
      
      if (existingPicker && (existingPicker.textContent?.includes('Pick one component') || 
                            existingPicker.textContent?.includes('contact') ||
                            existingPicker.textContent?.includes('violation'))) {
        console.log('🔄🔄🔄 REAL-TIME: Re-filtering open component picker due to ListingType change');
        // Reset first, then filter immediately for real-time updates
        resetComponentPicker();
        setTimeout(() => {
          filterComponentPicker();
        }, 10);
        setTimeout(() => {
          filterComponentPicker();
        }, 25);
        setTimeout(() => {
          filterComponentPicker();
        }, 50);
      }
    }
  });
  
  // Enhanced listener for clicks on ListingType options with broader detection
  // Use capture phase to catch events before they're handled by other listeners
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    
    // Debug all clicks for troubleshooting
    if (target && target.textContent && target.textContent.includes('Bank')) {
      console.log('🔍 DEBUG: Bank click detected on element:', target.tagName, target.className, target.textContent.trim());
    }
    
    // Strategy 1: Direct text matching (including SPAN elements)
    if (target && target.textContent) {
      const text = target.textContent.trim();
      if (['Bank', 'Scammer', 'Business', 'Seller'].includes(text)) {
        console.log('🎯 DIRECT: ListingType option clicked:', text);
        handleListingTypeChange(text);
        return;
      }
    }
    
    // Strategy 2: Check parent elements for ListingType text
    let currentElement: Element | null = target;
    for (let i = 0; i < 5; i++) {
      if (currentElement && currentElement.textContent) {
        const text = currentElement.textContent.trim();
        if (['Bank', 'Scammer', 'Business', 'Seller'].includes(text)) {
          console.log('🎯 PARENT: ListingType option clicked:', text);
          handleListingTypeChange(text);
          return;
        }
      }
      currentElement = currentElement.parentElement;
      if (!currentElement) break;
    }
    
    // Strategy 3: Check if click is within a dropdown option (for combobox selections)
    const dropdownOption = target.closest('[role="option"]') || 
                          target.closest('[data-value]') ||
                          target.closest('button[role="option"]') ||
                          target.closest('div[role="option"]');
    
    if (dropdownOption && dropdownOption.textContent) {
      const optionText = dropdownOption.textContent.trim();
      if (['Bank', 'Scammer', 'Business', 'Seller'].includes(optionText)) {
        console.log('🎯 DROPDOWN: ListingType option clicked:', optionText);
        handleListingTypeChange(optionText);
        return;
      }
    }
    
    // Strategy 4: Check if click is within a ListingType dropdown/relation field
    const relationContainer = target.closest('[name="ListingType"]') || 
                             target.closest('[data-field="ListingType"]') ||
                             target.closest('.relation-field') ||
                             target.closest('[class*="relation"]') ||
                             target.closest('[class*="Relation"]');
    
    if (relationContainer) {
      console.log('🎯 RELATION: Click detected in ListingType field area');
      // Check if the clicked element contains ListingType text
      const clickedText = target.textContent?.trim();
      if (clickedText && ['Bank', 'Scammer', 'Business', 'Seller'].includes(clickedText)) {
        console.log('🎯 RELATION-TEXT: ListingType option clicked in relation area:', clickedText);
        handleListingTypeChange(clickedText);
        return;
      }
      
      // Wait a bit for the selection to be processed, then check form state
      setTimeout(() => {
        checkForListingTypeChange();
      }, 200);
    }
  }, true); // Use capture phase to catch events early
  
  // Helper function to handle ListingType changes
  const handleListingTypeChange = async (text: string) => {
    console.log('🔄 ListingType selected:', text);
    
    // Use dynamic detection instead of hardcoded mapping
    const newListingType = await detectListingTypeId(text);
    const oldListingType = (window as any).selectedListingType;
    
    if (!newListingType) {
      console.log('❌ Could not detect ListingType ID for:', text);
      return;
    }
    
    (window as any).selectedListingType = newListingType;
    console.log('🎯 Stored ListingType ID:', newListingType, 'for', text);
    
    // Always clear cache and re-filter when ListingType is selected (even if it's the same)
    console.log('🔄 ListingType selected:', text, '(ID:', newListingType, ') - Previous:', oldListingType);
    (window as any).componentPickerCache = null;
    
    // Always try to re-filter when ListingType changes, regardless of picker state
    console.log('🔄🔄🔄 REAL-TIME CLICK: Re-filtering for ListingType change:', text);
    console.log('🚀 FORCE RE-FILTER: Applying filtering regardless of picker detection');
    
    // Clear any existing timeout and apply single debounced filtering
    if (filteringTimeout) {
      clearTimeout(filteringTimeout);
    }
    
    // Single debounced re-filter
    filteringTimeout = setTimeout(() => {
      filterComponentPicker();
    }, 100);
  };

  // Dynamic ListingType ID detection function
  const detectListingTypeId = async (text: string): Promise<string | null> => {
    try {
      console.log('🔍 Detecting ListingType ID for:', text);
      
      // Strategy 0: Query API directly to find ID by name (most reliable)
      try {
        const response = await fetch('/api/listing-types?pagination[limit]=50');
        if (response.ok) {
          const data = await response.json();
          const listingTypes = data.data || [];
          
          for (const listingType of listingTypes) {
            if (listingType.Name === text) {
              console.log(`🎯 Strategy 0 (API): Found ID ${listingType.id} for "${text}" via API query`);
              return listingType.id.toString();
            }
          }
        }
      } catch (apiError) {
        console.log('⚠️ Strategy 0 (API) failed:', apiError);
      }
      
      // Strategy 1: Look for elements with data-* attributes containing numeric IDs
      const elementsWithData = document.querySelectorAll('[data-*]');
      for (const element of elementsWithData) {
        const attributes = element.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
            // Check if this element contains the text we're looking for
            const elementText = element.textContent?.trim();
            if (elementText === text) {
              console.log(`🎯 Strategy 1: Found ID ${attr.value} for "${text}" via data attribute`);
              return attr.value;
            }
          }
        }
      }
      
      // Strategy 2: Look for buttons with the text and check their attributes
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const buttonText = button.textContent?.trim();
        if (buttonText === text) {
          const buttonId = button.getAttribute('data-id') || 
                         button.getAttribute('data-value') ||
                         button.getAttribute('value');
          
          if (buttonId && /^\d+$/.test(buttonId)) {
            console.log(`🎯 Strategy 2: Found ID ${buttonId} for "${text}" via button attribute`);
            return buttonId;
          }
        }
      }
      
      // Strategy 3: Look for ID in parent/sibling elements of text matches
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        if (element.textContent?.trim() === text) {
          // Check parent elements for data attributes
          let parent = element.parentElement;
          while (parent) {
            const parentAttrs = parent.attributes;
            for (let i = 0; i < parentAttrs.length; i++) {
              const attr = parentAttrs[i];
              if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
                console.log(`🎯 Strategy 3: Found ID ${attr.value} for "${text}" via parent element`);
                return attr.value;
              }
            }
            parent = parent.parentElement;
          }
        }
      }
      
      // Strategy 4: Scan all elements with data attributes and filter by context
      for (const element of elementsWithData) {
        const attributes = element.attributes;
        for (let i = 0; i < attributes.length; i++) {
          const attr = attributes[i];
          if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
            // Check if this element is in the context of our text
            const elementContext = element.closest('div, section, fieldset');
            if (elementContext && elementContext.textContent?.includes(text)) {
              console.log(`🎯 Strategy 4: Found ID ${attr.value} for "${text}" via context`);
              return attr.value;
            }
          }
        }
      }
      
      console.log('❌ Could not detect ID for ListingType:', text);
      return null;
    } catch (error) {
      console.error('❌ Error detecting ListingType ID:', error);
      return null;
    }
  };
  
  // Helper function to check for ListingType changes in form state
  const checkForListingTypeChange = async () => {
    try {
      const currentListingType = await getListingTypeFromFormState();
      const storedListingType = (window as any).selectedListingType;
      
      if (currentListingType) {
        console.log('🔄 FORM STATE: Current ListingType:', currentListingType, '- Stored:', storedListingType);
        
        // Always update and re-filter if we have a ListingType (even if it's the same)
        (window as any).selectedListingType = currentListingType;
        (window as any).componentPickerCache = null;
        
        // Always try to re-filter when ListingType changes, regardless of picker state
        console.log('🔄🔄🔄 REAL-TIME FORM: Re-filtering for ListingType change:', currentListingType);
        console.log('🚀 FORCE RE-FILTER: Applying filtering regardless of picker detection');
        
        // Clear any existing timeout and apply single debounced filtering
        if (filteringTimeout) {
          clearTimeout(filteringTimeout);
        }
        
        // Single debounced re-filter
        filteringTimeout = setTimeout(() => {
          filterComponentPicker();
        }, 100);
      } else {
        console.log('🔍 No ListingType found in form state');
        
        // If no ListingType in form state, try to detect from UI text
        await detectListingTypeFromUI();
      }
    } catch (error) {
      console.error('❌ Error checking ListingType change:', error);
    }
  };
  
  // Helper function to detect ListingType from UI text when form state is empty
  const detectListingTypeFromUI = async () => {
    try {
      console.log('🔍 Detecting ListingType from UI text...');
      
      // Look for ListingType text in the UI
      const listingTypeTexts = ['Bank', 'Scammer', 'Business', 'Seller'];
      
      for (const text of listingTypeTexts) {
        // Check if this text appears in the ListingType field area
        const relationInputs = document.querySelectorAll('input[name="ListingType"]');
        
        for (const input of relationInputs) {
          const container = input.closest('div');
          if (container && container.textContent && container.textContent.includes(text)) {
            console.log(`🎯 UI DETECTION: Found "${text}" in ListingType field`);
            
            // Use handleListingTypeChange to process this selection
            await handleListingTypeChange(text);
            return;
          }
        }
        
        // Also check for selected text in combobox areas
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        for (const combobox of comboboxes) {
          if (combobox.textContent && combobox.textContent.includes(text)) {
            // Check if this combobox is related to ListingType
            const listingTypeContainer = combobox.closest('div')?.querySelector('label');
            if (listingTypeContainer && listingTypeContainer.textContent && listingTypeContainer.textContent.includes('ListingType')) {
              console.log(`🎯 COMBOBOX DETECTION: Found "${text}" in ListingType combobox`);
              await handleListingTypeChange(text);
              return;
            }
          }
        }
      }
      
      console.log('🔍 No ListingType detected from UI text');
    } catch (error) {
      console.error('❌ Error detecting ListingType from UI:', error);
    }
  };
};

// Function to get listing type from current form state
const getListingTypeFromFormState = async (): Promise<string | null> => {
  try {
    console.log('🔍 Searching for ListingType in form state...');
    
    // REMOVED Strategy 0: Don't use cached value, always check actual form state
    // This ensures we get the real current selection, not cached old value
    
    // Strategy 1: Look for relation field input
    const relationSelectors = [
      'input[name="ListingType"]',
      '[name="ListingType"]',
      'input[type="relation"]',
      'input[role="combobox"][name="ListingType"]'
    ];
    
    let relationInput = null;
    for (const selector of relationSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        relationInput = input;
        console.log(`✅ Found ListingType relation input with selector: ${selector}`);
        break;
      }
    }
    
    if (relationInput) {
      // Check if there's a selected value displayed
      const inputValue = (relationInput as HTMLInputElement).value;
      console.log(`🔍 Relation input value: "${inputValue}"`);
      
      // Look for selected relation display (usually in a nearby element)
      const relationContainer = relationInput.closest('div, fieldset, section');
      if (relationContainer) {
        // Look for elements with data-* attributes that might contain the ID
        const allElements = relationContainer.querySelectorAll('*');
        for (const element of allElements) {
          // Check for data attributes that might contain ID
          const attributes = element.attributes;
          for (let i = 0; i < attributes.length; i++) {
            const attr = attributes[i];
            if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
              console.log(`🎯 Found potential ListingType ID from ${attr.name}: ${attr.value}`);
              return attr.value;
            }
          }
        }
        
        // Look for buttons with specific patterns that might indicate selection
        const buttons = relationContainer.querySelectorAll('button');
        for (const button of buttons) {
          const text = button.textContent?.trim();
          if (text && text !== 'Add or create a relation' && text !== 'Clear' && text !== 'Remove') {
            console.log(`🔍 Found selected relation text: "${text}"`);
            
            // Try to find ID in button attributes or nearby elements
            const buttonId = button.getAttribute('data-id') || 
                           button.getAttribute('data-value') ||
                           button.getAttribute('value');
            
            if (buttonId && /^\d+$/.test(buttonId)) {
              console.log(`🎯 Found ListingType ID from button: ${buttonId}`);
              return buttonId;
            }
            
            // Look for ID in parent/sibling elements
            const parent = button.parentElement;
            if (parent) {
              const parentAttrs = parent.attributes;
              for (let i = 0; i < parentAttrs.length; i++) {
                const attr = parentAttrs[i];
                if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
                  console.log(`🎯 Found ListingType ID from parent: ${attr.value}`);
                  return attr.value;
                }
              }
            }
          }
        }
      }
    }
    
    // Strategy 2: Look for any elements with ListingType ID in data attributes
    const allElementsWithData = document.querySelectorAll('*');
    console.log(`🔍 Found ${allElementsWithData.length} elements with data attributes to check`);
    
    for (const element of allElementsWithData) {
      const attributes = element.attributes;
      for (let i = 0; i < attributes.length; i++) {
        const attr = attributes[i];
        // Look for data attributes that contain numeric IDs
        if (attr.name.startsWith('data-') && attr.value && /^\d+$/.test(attr.value)) {
          // Check if this element is related to ListingType (by checking nearby text or context)
          const elementText = element.textContent?.trim();
          const parentText = element.parentElement?.textContent?.trim();
          
          if (elementText || parentText) {
            console.log(`🔍 Found element with ID ${attr.value}, text: "${elementText}", parent: "${parentText}"`);
            
            // If this seems to be a ListingType selection (not other relations)
            if (element.closest('[name="ListingType"]') || 
                elementText?.includes('ListingType') ||
                parentText?.includes('ListingType')) {
              console.log(`🎯 Found ListingType ID from data attribute: ${attr.value}`);
              return attr.value;
            }
          }
        }
      }
    }
    
    console.log('❌ No listing type found in form state');
    return null;
  } catch (error) {
    console.error('❌ Error getting listing type from form state:', error);
    return null;
  }
};

// Function to get item ID from URL
const getItemIdFromUrl = (): string | null => {
  try {
    const url = window.location.pathname;
    const match = url.match(/\/content-manager\/collection-types\/api::item\.item\/([^/?]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('❌ Error extracting item ID from URL:', error);
    return null;
  }
};

// Function to inject CSS for instant hiding
const injectHidingCSS = () => {
  const existingStyle = document.getElementById('smart-component-filter-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  const style = document.createElement('style');
  style.id = 'smart-component-filter-style';
  style.textContent = `
    /* Initially hide all categories except contact and violation */
    [role="dialog"] *:has-text("info"),
    [role="dialog"] *:has-text("utilities"),
    [role="dialog"] *:has-text("media"),
    [role="dialog"] *:has-text("review"),
    [role="dialog"] *:has-text("rating") {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
};

// Function to reset component picker to show all components
const resetComponentPicker = () => {
  console.log('🔄 Resetting component picker to show all components');
  
  // Remove any hidden styles we applied
  const allElements = document.querySelectorAll('*');
  allElements.forEach(element => {
    const htmlElement = element as HTMLElement;
    if (htmlElement.style.display === 'none' && 
        (htmlElement.textContent?.includes('contact') ||
         htmlElement.textContent?.includes('violation') ||
         htmlElement.textContent?.includes('info') ||
         htmlElement.textContent?.includes('utilities') ||
         htmlElement.textContent?.includes('media') ||
         htmlElement.textContent?.includes('review') ||
         htmlElement.textContent?.includes('rating'))) {
      htmlElement.style.display = '';
      console.log('🔄 Restored element:', htmlElement.textContent?.substring(0, 20));
    }
  });
};

// Function to hide ALL components when no components are allowed
const hideAllComponents = () => {
  console.log('🚫 Hiding ALL components - no components allowed');
  
  // First reset any previous filtering
  resetComponentPicker();
  
  // Find all category headers and hide them
  const categoryNames = ['contact', 'violation', 'info', 'utilities', 'media', 'review', 'rating', 'content'];
  const allElements = document.querySelectorAll('*');
  
  console.log(`🔍 Searching through ${allElements.length} elements to hide all categories...`);
  
  allElements.forEach((element) => {
    const text = element.textContent?.trim()?.toLowerCase() || '';
    
    // Check if this element's text exactly matches a category name
    if (categoryNames.includes(text)) {
      console.log(`🚫 Hiding category: "${text}"`);
      
      // Find the category container and hide it
      const categoryContainer = element.closest('section') || 
                               element.closest('li') || 
                               element.closest('div[class*="category"]') ||
                               element.closest('div');
      
      if (categoryContainer) {
        (categoryContainer as HTMLElement).style.display = 'none';
        console.log(`✅ Hidden entire category container: "${text}"`);
      } else {
        (element as HTMLElement).style.display = 'none';
        console.log(`✅ Hidden category header: "${text}"`);
      }
    }
  });
  
  console.log('✅ All components hidden successfully');
};

// Function to apply component filtering logic
const applyComponentFiltering = (allowedComponents: string[]) => {
  // Special case: If no components are allowed, hide everything
  if (allowedComponents.length === 0) {
    console.log('🚫 HIDING ALL COMPONENTS - No components allowed');
    hideAllComponents();
    return;
  }
  
  // Parse allowed components to get categories and component names
  const allowedCategories = new Set<string>();
  const allowedComponentsByCategory = new Map<string, Set<string>>();
  
  allowedComponents.forEach(comp => {
    const [category, componentName] = comp.split('.');
    let categoryLower = category.toLowerCase(); // Normalize to lowercase
    
    // Map API categories to UI categories
    const categoryMapping: { [key: string]: string } = {
      'content': 'media', // content.media-gallery -> media category
      // Add more mappings if needed
    };
    
    if (categoryMapping[categoryLower]) {
      categoryLower = categoryMapping[categoryLower];
    }
    
    allowedCategories.add(categoryLower);
    
    if (!allowedComponentsByCategory.has(categoryLower)) {
      allowedComponentsByCategory.set(categoryLower, new Set());
    }
    allowedComponentsByCategory.get(categoryLower)!.add(componentName);
  });
  
  console.log('📋 Allowed categories:', Array.from(allowedCategories));
  console.log('📋 Allowed components by category:', Object.fromEntries(allowedComponentsByCategory));
  
  // Apply filtering immediately and also with minimal delay
  const doFiltering = () => {
    console.log('🔍 Starting DOM analysis...');
    
    // First reset any previous filtering
    resetComponentPicker();
    
    // First, let's see what's actually in the DOM
    const allText = document.body.textContent || '';
    const hasContactText = allText.includes('contact');
    const hasViolationText = allText.includes('violation');
    const hasInfoText = allText.includes('info');
    
    console.log('🔍 DOM content check:');
    console.log(`   - Contains "contact": ${hasContactText}`);
    console.log(`   - Contains "violation": ${hasViolationText}`);
    console.log(`   - Contains "info": ${hasInfoText}`);
    console.log(`   - Total body text length: ${allText.length}`);
    
    // Find all elements that contain category names
    const categoryNames = ['contact', 'violation', 'info', 'utilities', 'media', 'review', 'rating', 'content'];
    const categoryHeaders: Element[] = [];
    
    // Search through all elements to find category headers
    const allElements = document.querySelectorAll('*');
    console.log(`🔍 Searching through ${allElements.length} elements for category headers...`);
    
    allElements.forEach((element) => {
      const text = element.textContent?.trim()?.toLowerCase() || '';
      
      // Check if this element's text exactly matches a category name
      if (categoryNames.includes(text)) {
        // Make sure it's not a nested element (avoid duplicates)
        const isDirectCategory = !categoryHeaders.some(existing => 
          existing.contains(element) || element.contains(existing)
        );
        
        if (isDirectCategory) {
          categoryHeaders.push(element);
          console.log(`✅ Found category header: "${text}" (${element.tagName})`);
        }
      }
    });
    
    console.log(`📋 Found ${categoryHeaders.length} category headers total`);
    
    // Debug: Look for content-related elements
    const allTextElements = document.querySelectorAll('*');
    const contentRelatedElements: string[] = [];
    allTextElements.forEach(el => {
      const text = el.textContent?.trim()?.toLowerCase() || '';
      if (text.includes('media') || text.includes('description') || text.includes('gallery')) {
        contentRelatedElements.push(`"${text}" (${el.tagName})`);
      }
    });
    console.log('🔍 Content-related elements found:', contentRelatedElements.slice(0, 10));
    
    if (!categoryHeaders || categoryHeaders.length === 0) {
      console.log('❌ No category headers found with any selector');
      return;
    }
    
    // Process each found category header
    
    categoryHeaders.forEach((header, index) => {
      const categoryName = header.textContent?.trim()?.toLowerCase();
      if (!categoryName) return;
      
      console.log(`🔍 Processing category ${index + 1}/${categoryHeaders!.length}: "${categoryName}"`);
      console.log(`🔍 Allowed categories:`, Array.from(allowedCategories));
      console.log(`🔍 Category "${categoryName}" is allowed:`, allowedCategories.has(categoryName));
      
      // Check if this category is allowed
      if (!allowedCategories.has(categoryName)) {
        // Hide category header and entire container immediately
        console.log(`🚫 Hiding category: "${categoryName}"`);
        
        // Find the category container (section, div, or li that contains this category)
        const categoryContainer = header.closest('section') || 
                                 header.closest('li') || 
                                 header.closest('div[class*="category"]') ||
                                 header.closest('div');
        
        if (categoryContainer) {
          // Hide the entire category container
          (categoryContainer as HTMLElement).style.display = 'none';
          console.log(`✅ Hidden entire category container: "${categoryName}"`);
        } else {
          // Fallback: hide just the header
          (header as HTMLElement).style.display = 'none';
          console.log(`✅ Hidden category header: "${categoryName}"`);
        }
        
      } else {
        console.log(`✅ Category is allowed: "${categoryName}" - SHOWING IT`);
        
        // Show category and filter components within it
        (header as HTMLElement).style.display = '';
        
        const categoryContainer = header.closest('div') || header.closest('section') || header.closest('li') || header.parentElement;
        if (categoryContainer) {
          // Show the entire category container
          (categoryContainer as HTMLElement).style.display = '';
          
          // Find component buttons within this category
          const componentSelectors = [
            'button:not([role="button"])',
            'div[role="button"]:not(h1):not(h2):not(h3)',
            '[data-testid*="component"]',
            '[class*="component"]'
          ];
          
          let componentButtons: NodeListOf<Element> | null = null;
          
          for (const selector of componentSelectors) {
            const buttons = categoryContainer.querySelectorAll(selector);
            if (buttons.length > 0) {
              componentButtons = buttons;
              console.log(`🔍 Found ${buttons.length} component buttons in "${categoryName}" using: ${selector}`);
              break;
            }
          }
          
          if (componentButtons) {
            const allowedComponentsInCategory = allowedComponentsByCategory.get(categoryName) || new Set();
            console.log(`🔍 Allowed components in "${categoryName}":`, Array.from(allowedComponentsInCategory));
            
            componentButtons.forEach((button, btnIndex) => {
              const buttonText = button.textContent?.trim();
              if (!buttonText || buttonText.toLowerCase() === categoryName) return; // Skip category header
              
              console.log(`🔍 Checking component button ${btnIndex + 1}: "${buttonText}"`);
              
              // Check if this component is allowed
              const buttonTextLower = buttonText.toLowerCase();
              const buttonTextKebab = buttonTextLower.replace(/\s+/g, '-');
              
              const isAllowed = Array.from(allowedComponentsInCategory).some(allowedComp => {
                const allowedCompLower = allowedComp.toLowerCase();
                return (
                  allowedComp === buttonTextKebab ||
                  allowedComp === buttonTextLower ||
                  allowedCompLower === buttonTextLower ||
                  allowedCompLower.includes(buttonTextLower) ||
                  buttonTextLower.includes(allowedCompLower) ||
                  // Special case for bank-info -> Bank
                  (allowedComp === 'bank-info' && buttonTextLower === 'bank')
                );
              });
              
              if (!isAllowed) {
                console.log(`🚫 Hiding component: "${buttonText}" in category: "${categoryName}"`);
                (button as HTMLElement).style.display = 'none';
              } else {
                console.log(`✅ Showing component: "${buttonText}" in category: "${categoryName}"`);
                (button as HTMLElement).style.display = '';
              }
            });
          } else {
            console.log(`❌ No component buttons found in category: "${categoryName}"`);
          }
        }
      }
    });
    
    console.log('✅ Component picker filtering complete');
  };
  
  // Execute filtering immediately and with short delays - OPTIMIZED VERSION
  console.log('🚀🚀🚀 OPTIMIZED: Executing immediate filtering...');
  doFiltering();
  setTimeout(doFiltering, 10);
  setTimeout(doFiltering, 50);
};

export default {
  register(app: StrapiApp) {
    console.log(`🚀 Smart Component Filter plugin registering with approach: ${PLUGIN_CONFIG.mode}`);
    
    // Register custom field
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'json',
      intlLabel: {
        id: `${PLUGIN_ID}.component-multi-select.label`,
        defaultMessage: 'Component Multi Select',
      },
      intlDescription: {
        id: `${PLUGIN_ID}.component-multi-select.description`,
        defaultMessage: 'Select multiple components for dynamic zones',
      },
      icon: 'apps' as any,
      components: {
        Input: async () => {
          return { default: ComponentMultiSelectInput as any };
        },
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
    });
    
    console.log('✅ Smart Component Filter plugin registered');
  },

  bootstrap(app: StrapiApp) {
    console.log(`🎯 Smart Component Filter: Starting ${PLUGIN_CONFIG.mode} component filtering system...`);
    console.log('📦 Plugin Version: 1.0.7 - API-based ID Detection');
    
    // Add version display to sidebar
    setTimeout(() => {
      const versionElement = document.createElement('div');
      versionElement.innerHTML = `
        <div style="
          position: fixed;
          top: 10px;
          right: 10px;
          background: #4945ff;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: bold;
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          Smart Filter v1.0.7
        </div>
      `;
      document.body.appendChild(versionElement);
    }, 1000);
    
    if (PLUGIN_CONFIG.mode === 'api') {
      console.log('📡 API-based component filter ready');
      
      // Setup observer to detect component picker
      setupComponentPickerObserver();
      
    } else {
      console.log('🔧 Hardcoded component filter ready');
      // Hardcoded logic would go here
    }
    
    console.log(`✅ Smart Component Filter bootstrap complete (${PLUGIN_CONFIG.mode} mode)`);
  },
}; 