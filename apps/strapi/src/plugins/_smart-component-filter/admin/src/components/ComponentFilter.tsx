import React, { useEffect, useState } from 'react';
import { getFetchClient, unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';

const ComponentFilter: React.FC = () => {
  const [filterData, setFilterData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Get content manager context to access form data
  const contentManagerContext = useContentManagerContext();
  
  // Get current URL to extract item documentId
  const currentUrl = window.location.href;
  const itemDocumentId = currentUrl.match(/api::item\.item\/([^?]*)/)?.[1];

  useEffect(() => {
    const fetchFilterData = async () => {
      console.log('=== SMART COMPONENT FILTER DEBUG ===');
      console.log('Current URL:', currentUrl);
      console.log('Extracted itemDocumentId:', itemDocumentId);
      console.log('Content Manager Context:', contentManagerContext);
      
      try {
        let listingTypeData = null;
        
        // Method 1: Try API call directly (public endpoint - more reliable)
        if (itemDocumentId) {
          console.log('Fetching from public API...');
          
          // Use public API endpoint - more reliable than admin API
          const response = await fetch(`/api/items/${itemDocumentId}?populate=*`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('✅ API Response:', data);
            
            if (data?.data?.ListingType?.ItemGroup) {
              listingTypeData = {
                name: data.data.ListingType.Name,
                itemGroup: data.data.ListingType.ItemGroup
              };
              console.log('✅ Extracted ListingType data:', listingTypeData);
            }
          } else {
            console.error('❌ API call failed:', response.status, response.statusText);
          }
        }
        
        if (listingTypeData && listingTypeData.itemGroup) {
          console.log('🎯 Processing ListingType data:', listingTypeData);
          
          // Parse ItemGroup array like ["info.bank-info"] into Map
          const componentMap = new Map<string, string[]>();
          
          listingTypeData.itemGroup.forEach((item: string) => {
            const [group, component] = item.split('.');
            if (group && component) {
              if (!componentMap.has(group)) {
                componentMap.set(group, []);
              }
              componentMap.get(group)!.push(component);
            }
          });
          
          console.log('🗺️ Parsed component map:', componentMap);
          
          setFilterData({
            listingTypeName: listingTypeData.name || 'Unknown',
            allowedComponents: listingTypeData.itemGroup,
            componentMap: componentMap,
            totalComponents: listingTypeData.itemGroup.length
          });
          
          console.log('✅ Successfully set filter data');
          
          // Apply filtering logic
          setTimeout(() => {
            applyComponentFiltering(componentMap);
          }, 1000);
          
        } else {
          console.warn('❌ No ListingType found, trying alternative methods...');
          
          // Try alternative: Check URL for specific patterns or use content manager context
          let fallbackData = null;
          
          if (currentUrl.includes('scammer') || currentUrl.includes('api::item.item')) {
            // For scammer items, use real expected structure
            fallbackData = {
              listingTypeName: 'Scammer (fallback)',
              allowedComponents: ['info.bank-info'], 
              componentMap: new Map([
                ['info', ['bank-info']]
              ]),
              totalComponents: 1
            };
            console.log('✅ Using scammer fallback data');
          } else {
            // Generic fallback
            fallbackData = {
              listingTypeName: 'Unknown (fallback)',
              allowedComponents: ['info.basic'],
              componentMap: new Map([
                ['info', ['basic']]
              ]),
              totalComponents: 1
            };
          }
          
          setFilterData(fallbackData);
        }
        
      } catch (error) {
        console.error('❌ Error fetching filter data:', error);
        
        // Fallback based on URL pattern instead of fake data
        let errorFallback = null;
        
        if (currentUrl.includes('scammer') || currentUrl.includes('api::item.item')) {
          errorFallback = {
            listingTypeName: 'Scammer (error fallback)',
            allowedComponents: ['info.bank-info'],
            componentMap: new Map([
              ['info', ['bank-info']]
            ]),
            totalComponents: 1
          };
        } else {
          errorFallback = {
            listingTypeName: 'Error - Unknown type',
            allowedComponents: ['info.basic'],
            componentMap: new Map([
              ['info', ['basic']]
            ]),
            totalComponents: 1
          };
        }
        
        setFilterData(errorFallback);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchFilterData();
    
    // Listen for changes and re-fetch if needed
    const interval = setInterval(() => {
      if (itemDocumentId && !filterData) {
        fetchFilterData();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [itemDocumentId]);

  const applyComponentFiltering = (componentMap: Map<string, string[]>) => {
    console.log('🎯 Applying component filtering with map:', componentMap);
    
    // Single filtering attempt to avoid interference
    let hasFiltered = false;
    
    const doSingleFilter = () => {
      if (hasFiltered) {
        console.log('⏸️ Already filtered, skipping to prevent interference');
        return;
      }
      
      // Check if component picker is open - look for h3 headings with component group names
      const componentGroups = document.querySelectorAll('h3');
      const knownGroups = ['contact', 'info', 'violation', 'utilities', 'media', 'review', 'rating'];
      const hasComponentPicker = Array.from(componentGroups).some(el => {
        const text = el.textContent?.toLowerCase().trim() || '';
        return knownGroups.includes(text);
      });
      
      if (!hasComponentPicker) {
        console.log('⏳ Component picker not open yet, skipping');
        return;
      }
      
      console.log('✅ Component picker detected, applying filtering...');
      
      hasFiltered = true;
      console.log('🔄 Applying single filter attempt');
      
      // Strategy 1: Target exact Strapi v5 component picker structure based on DOM inspection
        const strapiSelectors = [
          // Primary selectors matching actual DOM structure
          'h3 button', // h3 > button pattern from DOM
          'heading[level="3"] button', // heading with level 3 containing buttons
          'h3[role="heading"] button', // specific heading role with buttons
          // Fallback selectors
          'h3',
          'button[cursor="pointer"]',
          '[role="region"] h3'
        ];
        
        const allowedGroups = Array.from(componentMap.keys());
        console.log('✅ Target groups to show:', allowedGroups);
        
        let foundGroups = 0;
        let hiddenGroups = 0;
        
        // Target component group headings directly based on exact DOM structure
        const componentGroupHeadings = document.querySelectorAll('h3');
        
        componentGroupHeadings.forEach((heading, index) => {
          const textContent = heading.textContent?.toLowerCase().trim() || '';
          
          // Only process known component group headings
          if (!knownGroups.includes(textContent)) return;
          
          foundGroups++;
          console.log(`🔍 Found component group heading: "${textContent}"`);
          
          // Check if this group should be shown
          const shouldShow = allowedGroups.some(group => 
            textContent.includes(group.toLowerCase()) || 
            group.toLowerCase().includes(textContent)
          );
          
          // Hide/show the entire group section with !important to override Strapi styles
          // Based on DOM: each h3 contains the group, we need to hide the parent container
          const groupContainer = heading.parentElement; // This should contain the entire group
          
          if (groupContainer) {
            if (shouldShow) {
              groupContainer.style.setProperty('display', '', 'important');
              groupContainer.style.setProperty('opacity', '1', 'important');
              groupContainer.style.setProperty('visibility', 'visible', 'important');
              console.log(`✅ SHOWING GROUP: "${textContent}"`);
            } else {
              groupContainer.style.setProperty('display', 'none', 'important');
              groupContainer.style.setProperty('opacity', '0', 'important');
              groupContainer.style.setProperty('visibility', 'hidden', 'important');
              hiddenGroups++;
              console.log(`❌ HIDING GROUP: "${textContent}"`);
            }
          }
        });
        
        console.log(`📊 Filter complete: Found ${foundGroups} groups, hidden ${hiddenGroups}`);
        
        // Strategy 2: Broader sweep for any remaining visible groups  
        const allTextElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, button, span, div');
        
        allTextElements.forEach(element => {
          const text = element.textContent?.toLowerCase().trim() || '';
          const isKnownGroup = knownGroups.some(group => text === group);
          
          if (isKnownGroup && !allowedGroups.includes(text)) {
            const container = element.closest('div, section, article') as HTMLElement;
            if (container) {
              container.style.setProperty('display', 'none', 'important');
              container.style.setProperty('opacity', '0', 'important');
              container.style.setProperty('visibility', 'hidden', 'important');
              console.log(`🎯 Final sweep hidden: "${text}"`);
            }
          }
        });
    };
    
    // Apply filtering with a single delay to allow DOM to be ready
    setTimeout(doSingleFilter, 800);
  };

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