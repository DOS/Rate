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
const ComponentFilterFinal = () => {
    const [activeFilter, setActiveFilter] = (0, react_1.useState)('');
    const [logs, setLogs] = (0, react_1.useState)([]);
    const observerRef = (0, react_1.useRef)(null);
    const addLog = (message) => {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `${timestamp}: ${message}`;
        setLogs(prev => [...prev.slice(-3), logMessage]);
        console.log('[FINAL FILTER]', logMessage);
    };
    // Hardcoded mapping - Bank chỉ cho phép Basic và Location
    const getComponentMapping = () => ({
        'Bank': ['contact.Basic', 'contact.Location'],
        'Scammer': ['violation', 'contact.Social', 'review']
    });
    // Function to hide components based on filter
    const applyComponentFilter = (listingType) => {
        addLog(`🔥 APPLYING FILTER for ${listingType}`);
        const mapping = getComponentMapping();
        const allowedComponents = mapping[listingType] || [];
        // Wait for modal to be fully rendered
        setTimeout(() => {
            // Find all component category containers
            const categoryContainers = document.querySelectorAll('h3[role="tab"], button[role="tab"]');
            categoryContainers.forEach((header) => {
                const categoryName = header.textContent?.toLowerCase().trim();
                if (!categoryName)
                    return;
                // Check if this entire category should be hidden
                const categoryAllowed = allowedComponents.some(comp => comp.toLowerCase().includes(categoryName));
                const parentContainer = header.closest('div');
                if (parentContainer) {
                    if (categoryAllowed) {
                        parentContainer.style.display = 'block';
                        addLog(`✅ SHOWING category: ${categoryName}`);
                        // If it's contact category, filter individual components
                        if (categoryName === 'contact') {
                            const componentButtons = parentContainer.querySelectorAll('button[role="button"]');
                            componentButtons.forEach((btn) => {
                                const btnText = btn.textContent?.toLowerCase().trim();
                                const isAllowed = allowedComponents.some(comp => comp.toLowerCase().includes(btnText || ''));
                                if (isAllowed) {
                                    btn.style.display = 'block';
                                    addLog(`✅ SHOWING component: ${btnText}`);
                                }
                                else {
                                    btn.style.display = 'none';
                                    addLog(`❌ HIDING component: ${btnText}`);
                                }
                            });
                        }
                    }
                    else {
                        parentContainer.style.display = 'none';
                        addLog(`❌ HIDING category: ${categoryName}`);
                    }
                }
            });
            addLog(`🎯 FILTER APPLIED! Allowed: ${allowedComponents.join(', ')}`);
        }, 100);
    };
    // Function to detect ListingType
    const detectListingType = () => {
        // Look for Bank or Scammer buttons in the page
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
            const text = button.textContent?.trim();
            if (text === 'Bank') {
                addLog('🏦 DETECTED: Bank selected');
                return 'Bank';
            }
            if (text === 'Scammer') {
                addLog('🦹 DETECTED: Scammer selected');
                return 'Scammer';
            }
        }
        return '';
    };
    // Setup component picker observer
    const setupComponentPickerObserver = () => {
        if (observerRef.current) {
            observerRef.current.disconnect();
        }
        observerRef.current = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;
                        // Check if component picker modal opened
                        if (element.textContent?.includes('Pick one component') ||
                            element.querySelector && element.querySelector('[role="dialog"]')) {
                            addLog('🎯 COMPONENT PICKER DETECTED!');
                            const currentFilter = detectListingType();
                            if (currentFilter) {
                                setActiveFilter(currentFilter);
                                applyComponentFilter(currentFilter);
                            }
                        }
                    }
                });
            });
        });
        observerRef.current.observe(document.body, {
            childList: true,
            subtree: true
        });
        addLog('👁️ Observer setup complete');
    };
    (0, react_1.useEffect)(() => {
        addLog('🚀 ComponentFilterFinal starting...');
        // Initial detection
        const initialFilter = detectListingType();
        if (initialFilter) {
            setActiveFilter(initialFilter);
        }
        // Setup observer
        setupComponentPickerObserver();
        // Periodic check
        const interval = setInterval(() => {
            const currentFilter = detectListingType();
            if (currentFilter && currentFilter !== activeFilter) {
                setActiveFilter(currentFilter);
                addLog(`🔄 Filter changed to: ${currentFilter}`);
            }
        }, 1000);
        return () => {
            clearInterval(interval);
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [activeFilter]);
    return (<div style={{
            padding: '16px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            marginTop: '16px'
        }}>
      <h3 style={{
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '8px',
            color: '#495057'
        }}>
        🎯 FINAL COMPONENT FILTER
      </h3>
      
      <div style={{
            fontSize: '12px',
            marginBottom: '8px',
            color: '#6c757d'
        }}>
        {activeFilter ? (<>
            <strong style={{ color: '#28a745' }}>Active Filter: {activeFilter}</strong>
            <br />
            <span>Allowed: {getComponentMapping()[activeFilter]?.join(', ') || 'None'}</span>
          </>) : ('Waiting for ListingType selection...')}
      </div>
      
      <div style={{
            fontSize: '11px',
            color: '#6c757d',
            maxHeight: '100px',
            overflowY: 'auto'
        }}>
        {logs.map((log, index) => (<div key={index}>{log}</div>))}
      </div>
    </div>);
};
exports.default = ComponentFilterFinal;
