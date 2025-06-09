import { StrapiApp } from '@strapi/strapi/admin';
import React from 'react';
import ComponentMultiSelectInput from './components/ComponentMultiSelectInput';
import packageJson from '../../package.json';

const PLUGIN_ID = 'smart-component-filter';

// Dynamic configuration from API
let LISTING_TYPE_COMPONENTS: { [key: string]: string[] } = {};

// Current state
let currentListingTypeId: string | null = null;
let isFilteringActive = false;

// Debounce variables
let filterTimeout: NodeJS.Timeout | null = null;



// Main filtering function
const filterComponents = async () => {
  if (isFilteringActive) return;
  isFilteringActive = true;
  
  try {
    // Get current ListingType ID
    const listingTypeId = await getCurrentListingTypeId();
    
    if (!listingTypeId) {
      showAllComponents();
      return;
    }
    
    // Get allowed components from API
    try {
      const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`);
      const data = await response.json();
      
      if (data.success && data.data?.allowedComponents) {
        const allowedComponents = data.data.allowedComponents;
        
        // Get all available components to validate
        const allComponentsResponse = await fetch('/api/smart-component-filter/components');
        const allComponentsData = await allComponentsResponse.json();
        
        if (allComponentsData.success && allComponentsData.data?.components) {
          const validComponentUIDs = new Set(allComponentsData.data.components.map((c: any) => c.uid));
          
          // Filter out invalid components
          const validAllowedComponents = allowedComponents.filter((uid: string) => {
            return validComponentUIDs.has(uid);
          });
          
          if (validAllowedComponents.length === 0) {
            hideAllComponents();
            return;
          }
          
          // Apply filtering with valid components only
          applyFiltering(validAllowedComponents);
        } else {
          // Could not validate components, use all allowed components
          applyFiltering(allowedComponents);
        }
      } else {
        showAllComponents(); // Fallback
      }
    } catch (error) {
      showAllComponents(); // Fallback
    }
    
  } catch (error) {
    showAllComponents(); // Fallback to show all
  } finally {
    isFilteringActive = false;
  }
};

// Get current ListingType ID from form
const getCurrentListingTypeId = async (): Promise<string | null> => {
  try {
    // Method 1: Check input value
    const listingTypeInputs = document.querySelectorAll('input[name="ListingType"]');
    
    for (const input of listingTypeInputs) {
      const value = (input as HTMLInputElement).value;
      if (value && value !== '') {
        return value;
      }
    }
    
    // Method 2: Check for selected text in various selectors
    const selectors = [
      'input[name="ListingType"]',
      '[data-strapi-field="ListingType"]',
      'input[placeholder*="relation"]',
      'input[placeholder*="Add or create"]',
      'div:has(input[name="ListingType"]) span',
      'div:has(input[name="ListingType"]) div'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        const text = element.textContent?.trim();
        const value = (element as HTMLInputElement).value;
        
        if (text && text !== 'Add or create a relation' && text !== 'Select...') {
          const id = getListingTypeIdFromText(text);
          if (id) {
            return id;
          }
        }
      }
    }
    
    // Method 3: Check for any text containing ListingType names
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      const text = element.textContent?.trim();
      if (text && ['Scammer', 'Bank', 'Seller', 'Business'].includes(text)) {
        // Check if this element is related to ListingType field
        const parent = element.closest('div');
        if (parent && parent.querySelector('input[name="ListingType"]')) {
          const id = getListingTypeIdFromText(text);
          if (id) {
            return id;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

// Convert ListingType text to ID
const getListingTypeIdFromText = (text: string): string | null => {
  const mapping: { [key: string]: string } = {
    'Scammer': '1',
    'Bank': '7', 
    'Seller': '22',
    'Business': '23'
  };
  
  return mapping[text] || null;
};

// Apply filtering to component picker
const applyFiltering = (allowedComponents: string[]) => {
  // Reset all components first
  showAllComponents();
  
  // Parse allowed components
  const allowedCategories = new Set<string>();
  const componentsByCategory = new Map<string, Set<string>>();
  
  allowedComponents.forEach(comp => {
    const [category, component] = comp.split('.');
    allowedCategories.add(category);
    
    if (!componentsByCategory.has(category)) {
      componentsByCategory.set(category, new Set());
    }
    componentsByCategory.get(category)!.add(component);
  });
  
  // Find and filter categories using correct DOM structure
  const categorySelectors = [
    'h3',           // Direct h3 elements
    'h2',           // Direct h2 elements  
    'heading',      // ARIA heading elements
    'button[expanded]',  // Expanded buttons
    'button[aria-expanded]'  // ARIA expanded buttons
  ];
  
  let foundCategories = 0;
  
  for (const selector of categorySelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent?.trim()?.toLowerCase();
        if (!text) return;
        
        // Check if this is a category header
        const categoryNames = ['contact', 'violation', 'business', 'media', 'review', 'rating', 'info', 'utilities'];
        if (categoryNames.includes(text)) {
          foundCategories++;
          
          // Find the parent container (the category section)
          let container = element.closest('div');
          
          // Try to find the specific category container
          let currentParent = element.parentElement;
          while (currentParent && !currentParent.querySelector('button[data-testid*="component"], button:has(img)')) {
            currentParent = currentParent.parentElement;
            if (currentParent && currentParent.tagName === 'BODY') break;
          }
          
          if (currentParent && currentParent !== document.body) {
            container = currentParent;
          }
          
          if (allowedCategories.has(text)) {
            (element as HTMLElement).style.display = '';
            
            // Show parent container
            if (container) {
              (container as HTMLElement).style.display = '';
            }
            
            // Filter components within this category
            filterComponentsInCategory(container || element, componentsByCategory.get(text) || new Set());
            
          } else {
            (element as HTMLElement).style.display = 'none';
            
            // Hide parent container
            if (container) {
              (container as HTMLElement).style.display = 'none';
            }
          }
        }
      });
    } catch (error) {
      // Handle error silently
    }
  }

};

// Filter components within a category
const filterComponentsInCategory = (categoryElement: Element, allowedComponents: Set<string>) => {
  // Look for component buttons more specifically
  const componentButtons = categoryElement.querySelectorAll('button:not([expanded]):not([aria-expanded])');
  
  componentButtons.forEach(button => {
    const text = button.textContent?.trim();
    if (!text) return;
    
    // Improved matching logic with better component name mapping
    const isAllowed = Array.from(allowedComponents).some(comp => {
      const compLower = comp.toLowerCase();
      const textLower = text.toLowerCase();
      
      // Extract component name from UID (e.g., "contact.basic" -> "basic")
      const compName = compLower.includes('.') ? compLower.split('.').pop() || compLower : compLower;
      
      // Direct matches
      if (textLower === compName) return true;
      if (textLower.includes(compName)) return true;
      if (compName.includes(textLower)) return true;
      
      // Handle special cases
      const mappings: { [key: string]: string[] } = {
        'basic': ['basic', 'contact'],
        'social-media': ['social', 'social-media'],
        'location': ['location', 'address'],
        'detail': ['detail', 'violation'],
        'evidence': ['evidence', 'proof'],
        'photo': ['photo', 'image', 'picture']
      };
      
      if (mappings[compName]) {
        return mappings[compName].some((alias: string) => 
          textLower.includes(alias) || alias.includes(textLower)
        );
      }
      
      return false;
    });
    
    if (isAllowed) {
      (button as HTMLElement).style.display = '';
      (button as HTMLElement).style.visibility = '';
    } else {
      (button as HTMLElement).style.display = 'none';
    }
  });
};

// Show all components
const showAllComponents = () => {
  const allElements = document.querySelectorAll('[style*="display: none"]');
  allElements.forEach(element => {
    (element as HTMLElement).style.display = '';
  });
};

// Hide all components
const hideAllComponents = () => {
  const componentButtons = document.querySelectorAll('button:not([role="button"]), div[role="button"]:not(h1):not(h2):not(h3)');
  componentButtons.forEach(button => {
    (button as HTMLElement).style.display = 'none';
  });
};

// Debounced filtering
const debouncedFilter = () => {
  if (filterTimeout) {
    clearTimeout(filterTimeout);
  }
  
  filterTimeout = setTimeout(() => {
    filterComponents();
  }, 300);
};

// Setup observers
const setupObservers = () => {
  // Observer for DOM changes
  const observer = new MutationObserver((mutations) => {
    let shouldFilter = false;
    
    mutations.forEach((mutation) => {
      // Check for ListingType changes
      if (mutation.type === 'childList') {
        const addedNodes = Array.from(mutation.addedNodes);
        const hasListingTypeChange = addedNodes.some(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            return element.querySelector && (
              element.querySelector('input[name="ListingType"]') ||
              element.querySelector('[data-strapi-field="ListingType"]') ||
              element.querySelector('button[type="button"]')
            );
          }
          return false;
        });
        
        if (hasListingTypeChange) {
          shouldFilter = true;
        }
      }
      
      // Check for attribute changes on ListingType fields
      if (mutation.type === 'attributes' && mutation.target) {
        const target = mutation.target as Element;
        if (target.matches && (
          target.matches('input[name="ListingType"]') ||
          target.matches('[data-strapi-field="ListingType"]')
        )) {
          shouldFilter = true;
        }
      }
    });
    
    if (shouldFilter) {
      debouncedFilter();
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'data-value']
  });
  
  // Listen for input changes
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target && target.matches && target.matches('input[name="ListingType"]')) {
      debouncedFilter();
    }
  });
  
  // Listen for click events on ListingType options
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target && target.textContent) {
      const text = target.textContent.trim();
      if (['Scammer', 'Bank', 'Seller', 'Business'].includes(text)) {
        setTimeout(() => debouncedFilter(), 500); // Delay to allow form update
      }
    }
  });
};

// Plugin registration
export default {
  register(app: StrapiApp) {
    // Plugin registration for Smart Component Filter
    
    // Register custom field with minimal intlLabel
    app.customFields.register({
      name: 'component-multi-select',
      pluginId: PLUGIN_ID,
      type: 'string',
      intlLabel: {
        id: 'smart-component-filter.component-multi-select.label',
        defaultMessage: 'Smart Component Filter',
      },
      intlDescription: {
        id: 'smart-component-filter.component-multi-select.description',
        defaultMessage: 'Enhanced component selection with smart filtering',
      },
      components: {
        Input: (async () => {
          const module = await import('./components/ComponentMultiSelectInput');
          return { default: module.default };
        }) as any,
      },
      options: {
        base: [],
        advanced: [],
        validator: () => ({}),
      },
    });
    
    // Custom field registered successfully
  },

  bootstrap(app: StrapiApp) {
    // Initialize the filtering system
    setTimeout(() => {
      setupObservers();
    }, 1000);
  },
}; 