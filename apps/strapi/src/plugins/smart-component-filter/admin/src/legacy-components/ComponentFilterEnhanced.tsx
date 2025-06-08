import React, { useEffect, useState } from 'react';

const ComponentFilterEnhanced: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [allowedComponents, setAllowedComponents] = useState<string[]>([]);
  const [listingTypeData, setListingTypeData] = useState<any>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `${timestamp}: ${message}`;
    setLogs(prev => [...prev.slice(-4), logMessage]);
    console.log('[ENHANCED FILTER]', logMessage);
  };

  // Function to detect current ListingType from page context
  const detectListingType = () => {
    // Try multiple detection methods
    
    // Method 1: Check for ListingType selection buttons
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const text = button.textContent?.trim();
      if (text === 'Bank' || text === 'Scammer' || text === 'Business') {
        return text;
      }
    }
    
    // Method 2: Check for ListingType data in form
    const formData = document.querySelector('form');
    if (formData) {
      // Look for listing type in input fields, selects, etc.
      const inputs = formData.querySelectorAll('input, select, textarea');
      for (const input of inputs) {
        const value = (input as HTMLInputElement).value;
        if (value && ['Bank', 'Scammer', 'Business'].includes(value)) {
          return value;
        }
      }
    }
    
    // Method 3: URL detection
    const url = window.location.href;
    if (url.includes('listing-type')) {
      // Extract from URL if possible
      const urlParams = new URLSearchParams(window.location.search);
      const listingType = urlParams.get('listingType');
      if (listingType) return listingType;
    }
    
    return '';
  };

  // Enhanced function to fetch listing type configuration  
  const fetchListingTypeConfig = async (listingTypeName: string) => {
    try {
      addLog(`🔍 Fetching config for ListingType: ${listingTypeName}`);
      
      // Mock data mapping based on listing type
      // In production, this would be API call to get real data
      const configMapping: Record<string, {
        ItemGroup: string[];
        ReviewGroup: string[];
        allowedCategories: string[];
      }> = {
        'Bank': {
          ItemGroup: ['contact.basic', 'contact.location'],
          ReviewGroup: ['review.rating', 'review.comment'],
          allowedCategories: ['contact', 'review']
        },
        'Scammer': {
          ItemGroup: ['contact.social', 'violation.fraud-details', 'violation.evidence'],
          ReviewGroup: ['review.rating', 'review.criteria'],
          allowedCategories: ['contact', 'violation', 'review']
        },
        'Business': {
          ItemGroup: ['contact.basic', 'contact.location', 'business.company-info', 'business.services'],
          ReviewGroup: ['review.rating', 'review.comment', 'review.criteria'],
          allowedCategories: ['contact', 'business', 'review', 'content']
        }
      };

      const config = configMapping[listingTypeName];
      if (config) {
        const allAllowed = [...config.ItemGroup, ...config.ReviewGroup];
        setAllowedComponents(allAllowed);
        setListingTypeData(config);
        addLog(`✅ Config loaded: ${allAllowed.length} allowed components`);
        return config;
      }
      
      addLog(`⚠️ No config found for ${listingTypeName}`);
      return null;
      
    } catch (error) {
      addLog(`❌ Error fetching config: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  // Smart component filtering based on UIDs instead of hardcoded categories
  const applySmartFilter = (allowedUIDs: string[]) => {
    addLog(`🎯 APPLYING SMART FILTER with ${allowedUIDs.length} allowed components`);
    
    // Find component picker modal with improved detection
    let modalContainer = document.querySelector('[data-testid="modal"], .modal, [role="dialog"]');
    
    if (!modalContainer) {
      // Fallback detection
      const elementsWithPickerText = Array.from(document.querySelectorAll('*')).filter(
        el => el.textContent?.includes('Pick one component')
      );
      
      for (const element of elementsWithPickerText) {
        const hasComponents = element.querySelector('h3') || element.querySelectorAll('button').length > 5;
        if (hasComponents) {
          modalContainer = element;
          addLog('📋 Found modal via fallback detection');
          break;
        }
      }
    }
    
    if (!modalContainer) {
      addLog('❌ Component picker modal not found');
      return;
    }

    // Reset previous filters
    const prevHidden = modalContainer.querySelectorAll('[data-smart-filter-hidden]');
    prevHidden.forEach(element => {
      (element as HTMLElement).style.display = '';
      element.removeAttribute('data-smart-filter-hidden');
    });
    addLog(`🔄 Reset ${prevHidden.length} previously hidden elements`);

    // Extract category and component from UID (e.g., 'contact.basic' -> category: 'contact', component: 'basic')
    const allowedCategories = new Set<string>();
    const allowedCategoryComponents: Record<string, string[]> = {};
    
    allowedUIDs.forEach(uid => {
      const [category, component] = uid.split('.');
      if (category && component) {
        allowedCategories.add(category);
        if (!allowedCategoryComponents[category]) {
          allowedCategoryComponents[category] = [];
        }
        allowedCategoryComponents[category].push(component);
      }
    });

    addLog(`📊 Allowed categories: ${Array.from(allowedCategories).join(', ')}`);

    // Hide entire category groups that are not allowed
    const categoryHeadings = modalContainer.querySelectorAll('h3');
    let hiddenCategories = 0;
    
    categoryHeadings.forEach(heading => {
      const headingText = heading.textContent?.toLowerCase() || '';
      const categoryMatch = Array.from(allowedCategories).find(cat => 
        headingText.includes(cat.toLowerCase())
      );
      
      if (!categoryMatch) {
        // Hide entire category group
        let groupContainer = heading.closest('div[role="region"], section, article') as HTMLElement;
        if (!groupContainer) {
          // Fallback: hide heading and next siblings
          (heading as HTMLElement).style.display = 'none';
          heading.setAttribute('data-smart-filter-hidden', 'true');
          
          let nextSibling = heading.nextElementSibling;
          while (nextSibling && nextSibling.tagName !== 'H3') {
            (nextSibling as HTMLElement).style.display = 'none';
            nextSibling.setAttribute('data-smart-filter-hidden', 'true');
            nextSibling = nextSibling.nextElementSibling;
          }
        } else {
          groupContainer.style.display = 'none';
          groupContainer.setAttribute('data-smart-filter-hidden', 'true');
        }
        hiddenCategories++;
        addLog(`❌ HIDDEN CATEGORY: ${headingText}`);
      }
    });

    // Within allowed categories, hide specific components that are not allowed
    let hiddenComponents = 0;
    
    Object.entries(allowedCategoryComponents).forEach(([category, allowedComps]) => {
      const categoryHeading = Array.from(categoryHeadings).find(h => 
        h.textContent?.toLowerCase().includes(category.toLowerCase())
      );
      
      if (categoryHeading) {
        // Find all buttons in this category
        let categorySection = categoryHeading.closest('div[role="region"], section, article');
        if (!categorySection) {
          // Fallback: look at next siblings until next heading
          categorySection = categoryHeading.parentElement;
        }
        
        if (categorySection) {
          const buttons = categorySection.querySelectorAll('button');
          buttons.forEach(button => {
            const buttonText = button.textContent?.trim().toLowerCase() || '';
            const isAllowed = allowedComps.some(comp => 
              buttonText.includes(comp.toLowerCase())
            );
            
            if (!isAllowed && buttonText.length > 0) {
              (button as HTMLElement).style.display = 'none';
              button.setAttribute('data-smart-filter-hidden', 'true');
              hiddenComponents++;
              addLog(`❌ HIDDEN COMPONENT: ${category}.${buttonText}`);
            }
          });
        }
      }
    });

    addLog(`✅ SMART FILTER APPLIED! Hidden: ${hiddenCategories} categories, ${hiddenComponents} components`);
    
    // Apply separator cleanup
    hideSeparators(modalContainer);
  };

  // Improved separator hiding
  const hideSeparators = (container: Element) => {
    const separatorElements = container.querySelectorAll('hr, [role="separator"]');
    separatorElements.forEach(el => {
      (el as HTMLElement).style.display = 'none';
      el.setAttribute('data-smart-filter-hidden', 'true');
    });
    
    // Hide border elements
    const borderElements = container.querySelectorAll('[class*="border"], [class*="divide"]');
    borderElements.forEach(el => {
      const hasSmallHeight = (el as HTMLElement).offsetHeight <= 5;
      if (hasSmallHeight) {
        (el as HTMLElement).style.display = 'none';
        el.setAttribute('data-smart-filter-hidden', 'true');
      }
    });
    
    addLog(`🧹 Cleaned up separators`);
  };

  useEffect(() => {
    addLog('🚀 Enhanced ComponentFilter starting...');
    
    let modalIsOpen = false;
    let currentListingType = '';
    
    // Enhanced mutation observer
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Detect component picker modal
            if (element.textContent?.includes('Pick one component')) {
              addLog('🎯 COMPONENT PICKER DETECTED!');
              modalIsOpen = true;
              
              // Apply filter if we have configuration
              if (allowedComponents.length > 0) {
                applySmartFilter(allowedComponents);
              } else {
                // Try to detect and load config
                const detectedType = detectListingType();
                if (detectedType && detectedType !== currentListingType) {
                  currentListingType = detectedType;
                  fetchListingTypeConfig(detectedType).then(config => {
                    if (config) {
                      const allAllowed = [...config.ItemGroup, ...config.ReviewGroup];
                      applySmartFilter(allAllowed);
                    }
                  });
                }
              }
            }
          }
        });
        
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.textContent?.includes('Pick one component')) {
              addLog('🎯 COMPONENT PICKER CLOSED!');
              modalIsOpen = false;
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Enhanced periodic check
    const interval = setInterval(() => {
      const currentFilter = detectListingType();
      
      // If listing type changed
      if (currentFilter && currentFilter !== activeFilter) {
        setActiveFilter(currentFilter);
        addLog(`🔄 ListingType changed to: ${currentFilter}`);
        
        // Load new configuration
        fetchListingTypeConfig(currentFilter);
      }
      
      // Check modal state
      const hasModalOpen = document.querySelector('[data-testid="modal"], .modal, [role="dialog"]') !== null ||
                           document.body.textContent?.includes('Pick one component') || false;
      
      if (hasModalOpen && !modalIsOpen) {
        modalIsOpen = true;
        addLog('🎯 MODAL DETECTED via periodic check');
        if (allowedComponents.length > 0) {
          applySmartFilter(allowedComponents);
        }
      } else if (!hasModalOpen && modalIsOpen) {
        modalIsOpen = false;
      }
    }, 300); // Faster polling for better UX

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [activeFilter, allowedComponents]);

  return (
    <div style={{ 
      padding: '16px', 
      backgroundColor: '#f8f9fa', 
      border: '1px solid #e9ecef',
      borderRadius: '8px',
      marginTop: '16px'
    }}>
      <h3 style={{ 
        fontSize: '14px', 
        fontWeight: 'bold', 
        marginBottom: '8px',
        color: '#495057'
      }}>
        🧠 ENHANCED SMART FILTER
      </h3>
      
      <div style={{ 
        fontSize: '12px', 
        marginBottom: '8px',
        color: '#6c757d'
      }}>
        {activeFilter ? (
          <>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ color: '#28a745' }}>Active: {activeFilter}</strong>
              <span style={{ marginLeft: '8px', color: '#17a2b8' }}>
                {allowedComponents.length} components allowed
              </span>
            </div>
            
            {listingTypeData && (
              <div style={{ fontSize: '11px', color: '#6c757d' }}>
                ItemGroup: {listingTypeData.ItemGroup?.length || 0} | 
                ReviewGroup: {listingTypeData.ReviewGroup?.length || 0}
              </div>
            )}
          </>
        ) : (
          'Waiting for ListingType detection...'
        )}
      </div>
      
      {allowedComponents.length > 0 && (
        <div style={{ 
          fontSize: '11px', 
          color: '#6c757d',
          backgroundColor: '#ffffff',
          padding: '8px',
          borderRadius: '4px',
          marginBottom: '8px'
        }}>
          <strong>Allowed:</strong> {allowedComponents.join(', ')}
        </div>
      )}
      
      <div style={{ 
        fontSize: '11px', 
        color: '#6c757d',
        maxHeight: '120px',
        overflowY: 'auto'
      }}>
        {logs.map((log, index) => (
          <div key={index} style={{ 
            marginBottom: '2px',
            fontFamily: 'monospace'
          }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComponentFilterEnhanced; 