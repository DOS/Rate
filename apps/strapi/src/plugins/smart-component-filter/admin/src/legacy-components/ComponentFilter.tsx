import React, { useEffect, useState, useRef } from 'react';
import { getFetchClient, unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';

const ComponentFilter: React.FC = () => {
  const [filterData, setFilterData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const hasAppliedFilter = useRef(false);
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Get content manager context to access form data
  const contentManagerContext = useContentManagerContext();
  
  // Get current URL to extract item documentId
  const currentUrl = window.location.href;
  const urlMatch = currentUrl.match(/api::item\.item\/([^?]*)/)?.[1];
  const itemDocumentId = (urlMatch && urlMatch !== 'create') ? urlMatch : null;
  const isCreate = urlMatch === 'create' || currentUrl.includes('/create');

  // Enhanced component picker detection with better timing
  const waitForComponentPicker = (callback: () => void, maxAttempts = 50) => {
    let attempts = 0;
    
    const checkForPicker = () => {
      attempts++;
      console.log(`🔍 Attempt ${attempts}: Checking for component picker...`);
      
      // Look for component picker indicators
      const componentGroups = document.querySelectorAll('h3, [role="heading"]');
      const knownGroups = ['contact', 'info', 'violation', 'utilities', 'media', 'review', 'rating'];
      
      const hasComponentPicker = Array.from(componentGroups).some(el => {
        const text = el.textContent?.toLowerCase().trim() || '';
        return knownGroups.includes(text);
      });
      
      // Also check for dynamic zone related elements
      const hasDynamicZone = document.querySelector('[data-strapi-field*="dynamic"]') ||
                            document.querySelector('[class*="DynamicZone"]') ||
                            document.querySelector('[aria-label*="component"]');
      
      if (hasComponentPicker || hasDynamicZone) {
        console.log('✅ Component picker detected! Applying filtering...');
        callback();
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(checkForPicker, 200); // Check every 200ms
      } else {
        console.log('⏰ Max attempts reached, no component picker found');
      }
    };
    
    checkForPicker();
  };

  // Enhanced ListingType selection monitoring với improved selectors
  const monitorListingTypeSelection = () => {
    console.log('🚀 Enhanced ListingType monitoring for create mode...');
    
    const setupListingTypeWatcher = () => {
      // Enhanced selectors để tìm ListingType dropdown
      const listingTypeSelectors = [
        'input[name*="listingType"]',
        'input[name*="listing_type"]', 
        'input[name*="ListingType"]',
        '[aria-label*="ListingType"]',
        '[aria-label*="Listing Type"]',
        '[data-name*="listingType"]'
      ];
      
      let foundListingTypeField = false;
      
      listingTypeSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (foundListingTypeField) return;
          
          console.log(`📋 Found potential ListingType field:`, element);
          foundListingTypeField = true;
          
          // Add comprehensive event listeners
          ['change', 'input', 'blur', 'focus'].forEach(eventType => {
            element.addEventListener(eventType, async (event) => {
              const target = event.target as HTMLInputElement;
              const value = target.value;
              
              console.log(`🔄 ListingType ${eventType}: "${value}"`);
              
              if (value && value.trim() !== '') {
                // Wait a bit for form to update then fetch data
                setTimeout(async () => {
                  await fetchListingTypeById(value);
                }, 500);
              }
            });
          });
          
          // Also monitor for React state changes via polling
          let lastValue = (element as HTMLInputElement).value;
          
          const pollForChanges = () => {
            const currentValue = (element as HTMLInputElement).value;
            if (currentValue !== lastValue && currentValue.trim() !== '') {
              console.log(`🔄 POLLING detected change: "${lastValue}" → "${currentValue}"`);
              lastValue = currentValue;
              fetchListingTypeById(currentValue);
            }
          };
          
          // Poll every 1 second
          setInterval(pollForChanges, 1000);
        });
      });
      
      // If no specific ListingType field found, monitor all select/input changes
      if (!foundListingTypeField) {
        console.log('⚠️ No specific ListingType field found, monitoring all dropdowns...');
        
        const allInputs = document.querySelectorAll('input[role="combobox"], select');
        allInputs.forEach(input => {
          input.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const value = target.value;
            
            // Check if this might be a ListingType by trying to fetch
            if (value && /^\d+$/.test(value)) {
              console.log(`🤔 Potential ListingType ID detected: ${value}`);
              try {
                await fetchListingTypeById(value);
              } catch (error) {
                // Silently ignore if not a ListingType
              }
            }
          });
        });
      }
    };
    
    // Setup with delay to let form render
    setTimeout(setupListingTypeWatcher, 1000);
    
    // Also setup a mutation observer to catch dynamically added fields
    const observer = new MutationObserver(() => {
      setTimeout(setupListingTypeWatcher, 500);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  const fetchListingTypeById = async (listingTypeId: string) => {
    console.log(`📡 Fetching ListingType data for ID: ${listingTypeId}`);
    
    try {
      const { get } = getFetchClient();
      
      // Fetch từ API listing-type trực tiếp
      const response = await get(`/api/listing-types/${listingTypeId}?populate=*`);
      const listingType = response.data;
      
      if (!listingType) {
        console.log(`❌ ListingType ${listingTypeId} not found`);
        return;
      }
      
      console.log(`✅ Loaded ListingType:`, listingType);
      
      // Extract component information
      const itemGroup = listingType.ItemGroup || [];
      const reviewGroup = listingType.ReviewGroup || [];
      
      // Create component map
      const componentMap = new Map<string, string[]>();
      
      // Map từ component UIDs sang group names
      itemGroup.forEach((componentUID: string) => {
        const [category] = componentUID.split('.');
        if (!componentMap.has(category)) {
          componentMap.set(category, []);
        }
        componentMap.get(category)!.push(componentUID);
      });
      
      reviewGroup.forEach((componentUID: string) => {
        const [category] = componentUID.split('.');
        if (!componentMap.has(category)) {
          componentMap.set(category, []);
        }
        componentMap.get(category)!.push(componentUID);
      });
      
      const filterData = {
        success: true,
        listingTypeName: listingType.Name || `ListingType ${listingTypeId}`,
        componentMap,
        allowedComponents: [...itemGroup, ...reviewGroup],
        totalComponents: itemGroup.length + reviewGroup.length
      };
      
      console.log('🎯 Setting filter data:', filterData);
      setFilterData(filterData);
      setLoading(false);
      
      // Apply filtering with proper timing
      waitForComponentPicker(() => {
        if (!hasAppliedFilter.current) {
          applyComponentFiltering(componentMap);
          hasAppliedFilter.current = true;
        }
      });
      
    } catch (error) {
      console.error('❌ Error fetching ListingType:', error);
      setLoading(false);
    }
  };

  const applyComponentFiltering = (componentMap: Map<string, string[]>) => {
    console.log('🎯 Applying enhanced component filtering...');
    
    const allowedGroups = Array.from(componentMap.keys());
    console.log('✅ Allowed groups:', allowedGroups);
    
    // Strategy 1: Target component group headings
    const componentGroups = document.querySelectorAll('h3, [role="heading"]');
    const knownGroups = ['contact', 'info', 'violation', 'utilities', 'media', 'review', 'rating'];
    
    let foundGroups = 0;
    let hiddenGroups = 0;
    
    componentGroups.forEach((heading) => {
      const textContent = heading.textContent?.toLowerCase().trim() || '';
      
      if (!knownGroups.includes(textContent)) return;
      
      foundGroups++;
      console.log(`🔍 Processing group: "${textContent}"`);
      
      const shouldShow = allowedGroups.some(group => 
        textContent.includes(group.toLowerCase()) || 
        group.toLowerCase().includes(textContent)
      );
      
      // Find the container to hide/show
      let container = heading.parentElement;
      
      // Try different container strategies
      if (!container) container = heading.closest('div, section, article') as HTMLElement;
      
      if (container) {
        if (shouldShow) {
          container.style.setProperty('display', '', 'important');
          container.style.setProperty('opacity', '1', 'important');
          container.style.setProperty('visibility', 'visible', 'important');
          console.log(`✅ SHOWING: "${textContent}"`);
        } else {
          container.style.setProperty('display', 'none', 'important');
          container.style.setProperty('opacity', '0', 'important');
          container.style.setProperty('visibility', 'hidden', 'important');
          hiddenGroups++;
          console.log(`❌ HIDING: "${textContent}"`);
        }
      }
    });
    
    console.log(`📊 Filtering complete: ${foundGroups} found, ${hiddenGroups} hidden`);
    
    // Strategy 2: Continuous monitoring for dynamic content
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
    }
    
    monitoringInterval.current = setInterval(() => {
      const newGroups = document.querySelectorAll('h3:not([data-filtered])');
      if (newGroups.length > 0) {
        console.log(`🔄 Found ${newGroups.length} new groups to filter`);
        newGroups.forEach(group => {
          const textContent = group.textContent?.toLowerCase().trim() || '';
          if (knownGroups.includes(textContent)) {
            group.setAttribute('data-filtered', 'true');
            
            const shouldShow = allowedGroups.some(allowed => 
              textContent.includes(allowed.toLowerCase()) || 
              allowed.toLowerCase().includes(textContent)
            );
            
            const container = group.parentElement || group.closest('div') as HTMLElement;
            if (container && !shouldShow) {
              container.style.setProperty('display', 'none', 'important');
              console.log(`🔄 Dynamically hidden: "${textContent}"`);
            }
          }
        });
      }
    }, 1000);
  };

  useEffect(() => {
    console.log('🚀 ComponentFilter mounted, URL:', currentUrl);
    setIsCreateMode(isCreate);
    
    if (isCreate) {
      console.log('📝 CREATE MODE detected - Setting up ListingType monitoring');
      setLoading(true);
      monitorListingTypeSelection();
    } else if (itemDocumentId) {
      console.log('📝 EDIT MODE detected - Loading existing item data');
      // For edit mode, could fetch existing item's ListingType
      // fetchExistingItemData(itemDocumentId);
    }
    
    return () => {
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
    };
  }, [currentUrl, isCreate, itemDocumentId]);

  if (loading) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#f6f6f9', borderRadius: '4px', margin: '16px 0' }}>
        <h3 style={{ color: '#32324d', fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0' }}>
          🧠 SMART COMPONENT FILTER
        </h3>
        <p style={{ color: '#666687', fontSize: '12px', margin: 0 }}>
          Loading filter data...
        </p>
      </div>
    );
  }

  if (!filterData) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#fdf4f4', borderRadius: '4px', margin: '16px 0' }}>
        <h3 style={{ color: '#d02b20', fontSize: '14px', fontWeight: 600, margin: '0 0 8px 0' }}>
          ❌ SMART COMPONENT FILTER
        </h3>
        <p style={{ color: '#d02b20', fontSize: '12px', margin: 0 }}>
          Failed to load filter data
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', backgroundColor: '#f6f6f9', borderRadius: '4px', margin: '16px 0' }}>
      <h3 style={{ color: '#32324d', fontSize: '14px', fontWeight: 600, margin: '0 0 12px 0' }}>
        🧠 SMART COMPONENT FILTER
      </h3>
      
      <div style={{ marginBottom: '8px' }}>
        <strong style={{ color: '#32324d', fontSize: '12px' }}>Current ListingType:</strong>
        <span style={{ color: '#4945ff', fontSize: '12px', marginLeft: '8px' }}>
          {filterData.listingTypeName}
        </span>
      </div>
      
      <div style={{ marginBottom: '8px' }}>
        <strong style={{ color: '#32324d', fontSize: '12px' }}>Allowed Components:</strong>
        <span style={{ color: '#328048', fontSize: '12px', marginLeft: '8px' }}>
          {filterData.totalComponents}
        </span>
      </div>
      
      <div style={{ marginBottom: '12px' }}>
        <strong style={{ color: '#32324d', fontSize: '12px' }}>Components for this type:</strong>
        <div style={{ 
          marginTop: '4px', 
          padding: '8px', 
          backgroundColor: '#ffffff', 
          borderRadius: '4px',
          fontSize: '11px',
          color: '#666687'
        }}>
          {filterData.allowedComponents.join(', ')}
        </div>
      </div>
      
      <div style={{ 
        padding: '8px', 
        backgroundColor: '#e6f7ff', 
        borderRadius: '4px',
        fontSize: '11px',
        color: '#1890ff'
      }}>
        <strong>Debug info:</strong><br/>
        Detected {filterData.listingTypeName} item from URL<br/>
        Component groups: {Array.from(filterData.componentMap.keys()).join(', ')}
      </div>
    </div>
  );
};

export default ComponentFilter;