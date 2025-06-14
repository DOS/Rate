"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const admin_1 = require("@strapi/strapi/admin");
const ComponentFilterNew = () => {
    const [filterData, setFilterData] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [debugInfo, setDebugInfo] = (0, react_1.useState)([]);
    const [selectedListingType, setSelectedListingType] = (0, react_1.useState)(null);
    const hasAppliedFilter = (0, react_1.useRef)(false);
    const monitoringInterval = (0, react_1.useRef)(null);
    const componentPickerObserver = (0, react_1.useRef)(null);
    // Get current URL to determine mode
    const currentUrl = window.location.href;
    const isCreateMode = currentUrl.includes('/create') || currentUrl.includes('create');
    const urlMatch = currentUrl.match(/api::item\.item\/([^?]*)/)?.[1];
    const itemDocumentId = (urlMatch && urlMatch !== 'create') ? urlMatch : null;
    const addDebug = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        const newMessage = `${timestamp}: ${message}`;
        setDebugInfo(prev => [...prev.slice(-4), newMessage]);
    };
    // Component mapping based on ListingType
    const getComponentMapping = () => {
        return {
            'Bank': ['contact.basic', 'contact.location', 'info', 'violation'],
            'Scammer': ['contact.basic', 'contact.social', 'violation', 'review', 'rating']
        };
    };
    // Apply component filtering to picker modal
    const applyComponentFilter = (allowedComponents) => {
        addDebug(`🎯 Applying filter for components: ${allowedComponents.join(', ')}`);
        // Find component picker modal
        const componentModal = document.querySelector('[role="dialog"]');
        if (!componentModal) {
            addDebug('❌ Component picker modal not found');
            return;
        }
        // Hide all component categories first
        const allCategories = componentModal.querySelectorAll('h3[data-strapi-header="true"]');
        const allCategoryContainers = componentModal.querySelectorAll('h3[data-strapi-header="true"]').length > 0
            ? componentModal.querySelectorAll('h3[data-strapi-header="true"]')
            : componentModal.querySelectorAll('h3');
        allCategoryContainers.forEach((category) => {
            const categoryContainer = category.closest('div[class*="accordion"]') || category.parentElement;
            if (categoryContainer) {
                categoryContainer.style.display = 'none';
            }
        });
        let visibleCount = 0;
        // Show only allowed categories/components
        allowedComponents.forEach(componentPath => {
            const [category, component] = componentPath.split('.');
            // Find category heading
            const categoryHeading = Array.from(allCategoryContainers).find((el) => el.textContent?.toLowerCase().includes(category.toLowerCase()));
            if (categoryHeading) {
                const categoryContainer = categoryHeading.closest('div[class*="accordion"]') || categoryHeading.parentElement;
                if (categoryContainer) {
                    categoryContainer.style.display = 'block';
                    visibleCount++;
                    // If specific component is specified, hide others in this category
                    if (component) {
                        const componentButtons = categoryContainer.querySelectorAll('button[data-strapi-accordion-content] button');
                        componentButtons.forEach((btn) => {
                            const btnText = btn.textContent?.toLowerCase();
                            if (btnText && !btnText.includes(component.toLowerCase())) {
                                btn.style.display = 'none';
                            }
                            else {
                                btn.style.display = 'flex';
                            }
                        });
                    }
                }
            }
        });
        addDebug(`✅ Filter applied! Showing ${visibleCount} categories`);
    };
    // Reset component filter (show all)
    const resetComponentFilter = () => {
        const componentModal = document.querySelector('[role="dialog"]');
        if (!componentModal)
            return;
        const allElements = componentModal.querySelectorAll('[style*="display: none"]');
        allElements.forEach((el) => {
            el.style.display = '';
        });
        addDebug('🔄 Component filter reset - showing all components');
    };
    // Setup component picker observer
    const setupComponentPickerObserver = () => {
        if (componentPickerObserver.current)
            return;
        componentPickerObserver.current = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.getAttribute?.('role') === 'dialog') {
                        addDebug('🎭 Component picker modal opened');
                        // Apply filter if we have selected ListingType
                        if (selectedListingType) {
                            setTimeout(() => {
                                const mapping = getComponentMapping();
                                const allowedComponents = mapping[selectedListingType.Name] || [];
                                if (allowedComponents.length > 0) {
                                    applyComponentFilter(allowedComponents);
                                }
                                else {
                                    addDebug(`⚠️ No component mapping found for: ${selectedListingType.Name}`);
                                }
                            }, 100);
                        }
                    }
                });
            });
        });
        componentPickerObserver.current.observe(document.body, {
            childList: true,
            subtree: true
        });
        addDebug('👁️ Component picker observer setup');
    };
    // Fetch ListingType data by ID
    const fetchListingTypeData = async (listingTypeId) => {
        try {
            const { get } = (0, admin_1.getFetchClient)();
            const response = await get(`/api/listing-types/${listingTypeId}`);
            if (response.data) {
                setSelectedListingType(response.data.data);
                addDebug(`📊 Fetched ListingType: ${response.data.data.Name}`);
                return response.data.data;
            }
        }
        catch (error) {
            addDebug(`❌ Error fetching ListingType: ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    };
    // Monitor ListingType changes
    const monitorListingType = () => {
        if (monitoringInterval.current) {
            clearInterval(monitoringInterval.current);
        }
        monitoringInterval.current = setInterval(() => {
            // Check for ListingType selection
            const listingTypeContainer = document.querySelector('[data-strapi-field-name*="ListingType"]') ||
                document.querySelector('input[name*="ListingType"]')?.closest('div[class*="field"]');
            if (listingTypeContainer) {
                // Look for selected ListingType button/chip
                const selectedChip = listingTypeContainer.querySelector('button[class*="chip"], button[class*="tag"], li[data-strapi-selected="true"] button');
                if (selectedChip) {
                    const listingTypeName = selectedChip.textContent?.trim();
                    if (listingTypeName && (!selectedListingType || selectedListingType.Name !== listingTypeName)) {
                        addDebug(`🔄 ListingType changed to: ${listingTypeName}`);
                        // Find ListingType ID from data attributes or relations
                        const relationContainer = listingTypeContainer.closest('[data-strapi-field-name]');
                        const hiddenInput = relationContainer?.querySelector('input[type="hidden"]');
                        const listingTypeId = hiddenInput?.value;
                        if (listingTypeId) {
                            fetchListingTypeData(listingTypeId);
                        }
                        else {
                            // Fallback: create mock data based on name
                            setSelectedListingType({ Name: listingTypeName, id: 'mock' });
                            addDebug(`📝 Using mock data for: ${listingTypeName}`);
                        }
                    }
                }
            }
        }, 1000);
    };
    // Initial data fetch
    const fetchFilterData = async () => {
        try {
            setLoading(true);
            addDebug('🔍 Setting up Smart Component Filter...');
            // Setup monitoring and observers
            setupComponentPickerObserver();
            monitorListingType();
            setLoading(false);
            addDebug('✅ Smart Component Filter ready!');
        }
        catch (error) {
            addDebug(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
            setLoading(false);
        }
    };
    (0, react_1.useEffect)(() => {
        fetchFilterData();
        return () => {
            if (monitoringInterval.current) {
                clearInterval(monitoringInterval.current);
            }
            if (componentPickerObserver.current) {
                componentPickerObserver.current.disconnect();
            }
        };
    }, []);
    return (<div style={{ padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '14px', fontWeight: 'bold' }}>
        🧠 SMART COMPONENT FILTER (v2.0)
      </h3>
      
      {selectedListingType ? (<div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
          <strong>📋 Active Filter:</strong> {selectedListingType.Name}
          <br />
          <small>Filtering components for {selectedListingType.Name} ListingType</small>
        </div>) : (<p style={{ margin: '0 0 12px 0', color: '#666', fontSize: '12px' }}>
          Waiting for ListingType selection...
        </p>)}
      
      <div style={{ fontSize: '11px', color: '#555', maxHeight: '120px', overflowY: 'auto' }}>
        {debugInfo.map((info, index) => (<div key={index} style={{ marginBottom: '2px', fontFamily: 'monospace' }}>
            {info}
          </div>))}
      </div>
      
      {selectedListingType && (<div style={{ marginTop: '8px', fontSize: '11px' }}>
          <button onClick={resetComponentFilter} style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#007cff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
            }}>
            🔄 Reset Filter
          </button>
        </div>)}
    </div>);
};
exports.default = ComponentFilterNew;
