"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = __importDefault(require("../../package.json"));
const PLUGIN_ID = 'smart-component-filter';
// Dynamic configuration from API
let LISTING_TYPE_COMPONENTS = {};
// Current state
let currentListingTypeId = null;
let isFilteringActive = false;
// Debounce variables
let filterTimeout = null;
// Main filtering function
const filterComponents = async () => {
    if (isFilteringActive)
        return;
    isFilteringActive = true;
    try {
        console.log('🎯 Starting component filtering...');
        // Get current ListingType ID
        const listingTypeId = await getCurrentListingTypeId();
        console.log('📋 Current ListingType ID:', listingTypeId);
        if (!listingTypeId) {
            console.log('❌ No ListingType found, showing all components');
            showAllComponents();
            return;
        }
        // Get allowed components from API
        try {
            console.log('🌐 Fetching allowed components from API...');
            const response = await fetch(`/api/smart-component-filter/listing-type/${listingTypeId}/components`);
            const data = await response.json();
            if (data.success && data.data?.allowedComponents) {
                const allowedComponents = data.data.allowedComponents;
                console.log('✅ Allowed components from API:', allowedComponents);
                // Get all available components to validate
                console.log('🔍 Validating component UIDs...');
                const allComponentsResponse = await fetch('/api/smart-component-filter/components');
                const allComponentsData = await allComponentsResponse.json();
                if (allComponentsData.success && allComponentsData.data?.components) {
                    const validComponentUIDs = new Set(allComponentsData.data.components.map((c) => c.uid));
                    // Filter out invalid components and log warnings
                    const validAllowedComponents = allowedComponents.filter((uid) => {
                        const isValid = validComponentUIDs.has(uid);
                        if (!isValid) {
                            console.warn(`⚠️ Invalid component UID found: "${uid}" - skipping from filter`);
                        }
                        return isValid;
                    });
                    console.log(`✅ Valid allowed components (${validAllowedComponents.length}/${allowedComponents.length}):`, validAllowedComponents);
                    if (validAllowedComponents.length === 0) {
                        console.log('🚫 No valid components found for this ListingType');
                        hideAllComponents();
                        return;
                    }
                    // Apply filtering with valid components only
                    applyFiltering(validAllowedComponents);
                }
                else {
                    console.warn('⚠️ Could not validate components, using all allowed components');
                    applyFiltering(allowedComponents);
                }
            }
            else {
                console.error('❌ Failed to get allowed components:', data);
                showAllComponents(); // Fallback
            }
        }
        catch (error) {
            console.error('❌ API call failed:', error);
            showAllComponents(); // Fallback
        }
    }
    catch (error) {
        console.error('❌ Error in filtering:', error);
        showAllComponents(); // Fallback to show all
    }
    finally {
        isFilteringActive = false;
    }
};
// Get current ListingType ID from form
const getCurrentListingTypeId = async () => {
    try {
        console.log('🔍 Searching for ListingType...');
        // Method 1: Check input value
        const listingTypeInputs = document.querySelectorAll('input[name="ListingType"]');
        console.log(`📋 Found ${listingTypeInputs.length} ListingType inputs`);
        for (const input of listingTypeInputs) {
            const value = input.value;
            console.log(`📋 Input value: "${value}"`);
            if (value && value !== '') {
                console.log('✅ Found ListingType from input:', value);
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
            console.log(`📋 Checking selector "${selector}": ${elements.length} elements`);
            for (const element of elements) {
                const text = element.textContent?.trim();
                const value = element.value;
                console.log(`📋 Element text: "${text}", value: "${value}"`);
                if (text && text !== 'Add or create a relation' && text !== 'Select...') {
                    const id = getListingTypeIdFromText(text);
                    if (id) {
                        console.log('✅ Found ListingType from text:', text, '-> ID:', id);
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
                        console.log('✅ Found ListingType from nearby text:', text, '-> ID:', id);
                        return id;
                    }
                }
            }
        }
        console.log('❌ No ListingType found');
        return null;
    }
    catch (error) {
        console.error('❌ Error getting ListingType ID:', error);
        return null;
    }
};
// Convert ListingType text to ID
const getListingTypeIdFromText = (text) => {
    const mapping = {
        'Scammer': '1',
        'Bank': '7',
        'Seller': '22',
        'Business': '23'
    };
    return mapping[text] || null;
};
// Apply filtering to component picker
const applyFiltering = (allowedComponents) => {
    console.log('🎯 Applying filtering with components:', allowedComponents);
    // Reset all components first
    showAllComponents();
    // Parse allowed components
    const allowedCategories = new Set();
    const componentsByCategory = new Map();
    allowedComponents.forEach(comp => {
        const [category, component] = comp.split('.');
        allowedCategories.add(category);
        if (!componentsByCategory.has(category)) {
            componentsByCategory.set(category, new Set());
        }
        componentsByCategory.get(category).add(component);
    });
    console.log('📋 Allowed categories:', Array.from(allowedCategories));
    console.log('📋 Components by category:', Object.fromEntries(componentsByCategory));
    // Find and filter categories using correct DOM structure
    const categorySelectors = [
        'h3', // Direct h3 elements
        'h2', // Direct h2 elements  
        'heading', // ARIA heading elements
        'button[expanded]', // Expanded buttons
        'button[aria-expanded]' // ARIA expanded buttons
    ];
    let foundCategories = 0;
    for (const selector of categorySelectors) {
        try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                const text = element.textContent?.trim()?.toLowerCase();
                if (!text)
                    return;
                // Check if this is a category header
                const categoryNames = ['contact', 'violation', 'business', 'media', 'review', 'rating', 'info', 'utilities'];
                if (categoryNames.includes(text)) {
                    foundCategories++;
                    console.log(`🔍 Found category: "${text}" using selector "${selector}"`);
                    // Find the parent container (the category section)
                    let container = element.closest('div');
                    // Try to find the specific category container
                    let currentParent = element.parentElement;
                    while (currentParent && !currentParent.querySelector('button[data-testid*="component"], button:has(img)')) {
                        currentParent = currentParent.parentElement;
                        if (currentParent && currentParent.tagName === 'BODY')
                            break;
                    }
                    if (currentParent && currentParent !== document.body) {
                        container = currentParent;
                    }
                    if (allowedCategories.has(text)) {
                        console.log(`✅ Showing category: "${text}"`);
                        element.style.display = '';
                        // Show parent container
                        if (container) {
                            container.style.display = '';
                        }
                        // Filter components within this category
                        filterComponentsInCategory(container || element, componentsByCategory.get(text) || new Set());
                    }
                    else {
                        console.log(`🚫 Hiding category: "${text}"`);
                        element.style.display = 'none';
                        // Hide parent container
                        if (container) {
                            container.style.display = 'none';
                        }
                    }
                }
            });
        }
        catch (error) {
            console.log('⚠️ Error with selector:', selector, error);
        }
    }
    console.log(`📊 Total categories found and processed: ${foundCategories}`);
};
// Filter components within a category
const filterComponentsInCategory = (categoryElement, allowedComponents) => {
    // Look for component buttons more specifically
    const componentButtons = categoryElement.querySelectorAll('button:not([expanded]):not([aria-expanded])');
    console.log(`🔍 Found ${componentButtons.length} component buttons in category`);
    console.log(`📋 Allowed components:`, Array.from(allowedComponents));
    componentButtons.forEach(button => {
        const text = button.textContent?.trim();
        if (!text)
            return;
        console.log(`🔍 Checking component button: "${text}"`);
        // Improved matching logic with better component name mapping
        const isAllowed = Array.from(allowedComponents).some(comp => {
            const compLower = comp.toLowerCase();
            const textLower = text.toLowerCase();
            // Extract component name from UID (e.g., "contact.basic" -> "basic")
            const compName = compLower.includes('.') ? compLower.split('.').pop() || compLower : compLower;
            // Direct matches
            if (textLower === compName)
                return true;
            if (textLower.includes(compName))
                return true;
            if (compName.includes(textLower))
                return true;
            // Handle special cases
            const mappings = {
                'basic': ['basic', 'contact'],
                'social-media': ['social', 'social-media'],
                'location': ['location', 'address'],
                'detail': ['detail', 'violation'],
                'evidence': ['evidence', 'proof'],
                'photo': ['photo', 'image', 'picture']
            };
            if (mappings[compName]) {
                return mappings[compName].some((alias) => textLower.includes(alias) || alias.includes(textLower));
            }
            return false;
        });
        if (isAllowed) {
            console.log(`✅ Showing component: "${text}"`);
            button.style.display = '';
            button.style.visibility = '';
        }
        else {
            console.log(`🚫 Hiding component: "${text}"`);
            button.style.display = 'none';
        }
    });
};
// Show all components
const showAllComponents = () => {
    const allElements = document.querySelectorAll('[style*="display: none"]');
    allElements.forEach(element => {
        element.style.display = '';
    });
    console.log('✅ Showing all components');
};
// Hide all components
const hideAllComponents = () => {
    const componentButtons = document.querySelectorAll('button:not([role="button"]), div[role="button"]:not(h1):not(h2):not(h3)');
    componentButtons.forEach(button => {
        button.style.display = 'none';
    });
    console.log('🚫 Hiding all components');
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
    console.log('🔍 Setting up observers...');
    // Observer for DOM changes
    const observer = new MutationObserver((mutations) => {
        let shouldFilter = false;
        mutations.forEach((mutation) => {
            // Check for ListingType changes
            if (mutation.type === 'childList') {
                const addedNodes = Array.from(mutation.addedNodes);
                const hasListingTypeChange = addedNodes.some(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;
                        return element.querySelector && (element.querySelector('input[name="ListingType"]') ||
                            element.querySelector('[data-strapi-field="ListingType"]') ||
                            element.querySelector('button[type="button"]'));
                    }
                    return false;
                });
                if (hasListingTypeChange) {
                    shouldFilter = true;
                }
            }
            // Check for attribute changes on ListingType fields
            if (mutation.type === 'attributes' && mutation.target) {
                const target = mutation.target;
                if (target.matches && (target.matches('input[name="ListingType"]') ||
                    target.matches('[data-strapi-field="ListingType"]'))) {
                    shouldFilter = true;
                }
            }
        });
        if (shouldFilter) {
            console.log('🔄 DOM change detected, triggering filter...');
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
        const target = event.target;
        if (target && target.matches && target.matches('input[name="ListingType"]')) {
            console.log('📝 ListingType input changed:', target.value);
            debouncedFilter();
        }
    });
    // Listen for click events on ListingType options
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target && target.textContent) {
            const text = target.textContent.trim();
            if (['Scammer', 'Bank', 'Seller', 'Business'].includes(text)) {
                console.log('🖱️ ListingType option clicked:', text);
                setTimeout(() => debouncedFilter(), 500); // Delay to allow form update
            }
        }
    });
    console.log('✅ Observers setup complete');
};
// Plugin registration
exports.default = {
    register(app) {
        console.log(`🔌 Smart Component Filter v${package_json_1.default.version} - Fixed field label to use user-defined name`);
        console.log('📋 Supported ListingTypes:', Object.keys(LISTING_TYPE_COMPONENTS));
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
                }),
            },
            options: {
                base: [],
                advanced: [],
                validator: () => ({}),
            },
        });
        console.log('✅ Custom field registered: component-multi-select');
    },
    bootstrap(app) {
        console.log(`🚀 Smart Component Filter v${package_json_1.default.version} - Bootstrap starting...`);
        // Add version display to UI
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
        ">
          Smart Filter v${package_json_1.default.version}
        </div>
      `;
            document.body.appendChild(versionElement);
            // Setup filtering system
            setupObservers();
            console.log(`✅ Smart Component Filter v${package_json_1.default.version} - Bootstrap completed`);
        }, 1000);
    },
};
