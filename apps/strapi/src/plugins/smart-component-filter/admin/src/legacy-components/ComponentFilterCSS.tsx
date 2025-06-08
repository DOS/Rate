import React, { useEffect, useState } from 'react';

const ComponentFilterCSS: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `${timestamp}: ${message}`;
    setLogs(prev => [...prev.slice(-3), logMessage]);
    console.log('[CSS FILTER]', logMessage);
  };

  // Function to detect ListingType
  const detectListingType = () => {
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const text = button.textContent?.trim();
      if (text === 'Bank') {
        return 'Bank';
      }
      if (text === 'Scammer') {
        return 'Scammer';
      }
    }
    return '';
  };

  // Function to apply DOM filter
  const applyDOMFilter = (listingType: string) => {
    addLog(`🎯 APPLYING GROUP-LEVEL FILTER for ${listingType} (NO DELAY)`);
    
    // IMMEDIATE execution - NO setTimeout delay to reduce lag
    // Try multiple selector patterns for component picker modal
    let modalContainer = document.querySelector('[data-testid="modal"], .modal, [role="dialog"]');
    
    if (!modalContainer) {
      // DIRECT APPROACH: Find modal by "Pick one component" text and h3 elements
      const allElements = document.querySelectorAll('*');
      addLog(`🔍 DEBUG: Scanning ${allElements.length} elements for "Pick one component"`);
      
      for (const element of allElements) {
        if (element.textContent?.includes('Pick one component')) {
          addLog(`🔍 DEBUG: Found "Pick one component" in ${element.tagName}.${element.className || 'no-class'}`);
          
          // Check if this element or its parent contains component groups (h3 elements)
          const hasComponentGroups = element.querySelector('h3') || element.querySelectorAll('h3').length > 0;
          addLog(`🔍 DEBUG: Element has component groups: ${hasComponentGroups}, h3Count: ${element.querySelectorAll('h3').length}`);
          
          if (hasComponentGroups) {
            modalContainer = element;
            addLog('📋 Found modal container with component groups');
            break;
          }
          
          // Otherwise try to find parent with component groups
          let parent = element.parentElement;
          let parentLevel = 0;
          while (parent && parent !== document.body && parentLevel < 10) {
            const parentHasGroups = parent.querySelector('h3') || parent.querySelectorAll('h3').length > 0;
            addLog(`🔍 DEBUG: Parent level ${parentLevel} (${parent.tagName}.${parent.className || 'no-class'}) has groups: ${parentHasGroups}, h3Count: ${parent.querySelectorAll('h3').length}`);
            
            if (parentHasGroups) {
              modalContainer = parent;
              addLog('📋 Found modal container via parent with component groups');
              break;
            }
            parent = parent.parentElement;
            parentLevel++;
          }
          
          if (modalContainer) break;
        }
      }
    }
    
    // SAFE FALLBACK: Only use document.body if we're definitely in modal context
    if (!modalContainer) {
      const hasPickOneComponent = document.body.textContent?.includes('Pick one component');
      const hasComponentGroups = document.querySelectorAll('h3').length > 0;
      
      addLog(`🔍 FALLBACK CHECK: hasPickOneComponent=${hasPickOneComponent}, hasComponentGroups=${hasComponentGroups}, h3Count=${document.querySelectorAll('h3').length}`);
      
      if (hasPickOneComponent && hasComponentGroups) {
        modalContainer = document.body;
        addLog('⚠️ FALLBACK: Using document.body as last resort');
      } else {
        addLog('❌ Safe modal container not found - SKIPPING to prevent sidebar issues');
        return;
      }
    }
    
    // Simple reset - only reset what we explicitly hid before  
    const prevHidden = modalContainer.querySelectorAll('[data-smart-filter-hidden]');
    prevHidden.forEach(element => {
      (element as HTMLElement).style.display = '';
      (element as HTMLElement).style.visibility = '';
      element.removeAttribute('data-smart-filter-hidden');
    });
    
    addLog(`🔄 RESET: ${prevHidden.length} previously hidden elements restored`);
    
    // SIMPLE SIDEBAR PROTECTION: Only hide if we're in component picker context
    const isInComponentModal = (element: Element): boolean => {
      // Simple check: if "Pick one component" text exists globally, we're in modal
      return document.body.textContent?.includes('Pick one component') || false;
    };

    if (listingType === 'Bank') {
      // Bank: Hide ENTIRE GROUP/BOX for unwanted categories
      const groupsToHide = ['info', 'violation', 'utilities', 'media', 'review', 'rating'];
      
      groupsToHide.forEach(groupName => {
        // Find and hide ENTIRE category group/box - WITH SIDEBAR PROTECTION
        const headings = modalContainer.querySelectorAll('h3');
        headings.forEach(heading => {
          if (heading.textContent?.toLowerCase().includes(groupName) && isInComponentModal(heading)) {
            // Hide the entire parent container/box
            let groupContainer = heading.closest('div[role="region"], div:has(h3), section, article') as HTMLElement;
            
            if (!groupContainer) {
              // Fallback: hide heading and next siblings until next heading
              (heading as HTMLElement).style.display = 'none';
              heading.setAttribute('data-smart-filter-hidden', 'true');
              
              let nextSibling = heading.nextElementSibling;
              while (nextSibling && nextSibling.tagName !== 'H3') {
                (nextSibling as HTMLElement).style.display = 'none';
                nextSibling.setAttribute('data-smart-filter-hidden', 'true');
                nextSibling = nextSibling.nextElementSibling;
              }
            } else {
              // Hide entire container/box
              groupContainer.style.display = 'none';
              groupContainer.setAttribute('data-smart-filter-hidden', 'true');
            }
            
            addLog(`❌ HIDING ENTIRE GROUP BOX: ${groupName}`);
          }
        });
      });
      
      // Hide Social button within contact (but keep Basic + Location) - WITH SIDEBAR PROTECTION
      const buttons = modalContainer.querySelectorAll('button');
      buttons.forEach(button => {
        if (button.textContent?.trim() === 'Social' && isInComponentModal(button)) {
          (button as HTMLElement).style.display = 'none';
          button.setAttribute('data-smart-filter-hidden', 'true');
          addLog(`❌ HIDING: Social button`);
        }
      });
      
      addLog(`✅ BANK GROUP FILTER APPLIED! Only contact.Basic + contact.Location visible`);
      
    } else if (listingType === 'Scammer') {
      // Scammer: Hide ENTIRE GROUP/BOX for unwanted categories
      const groupsToHide = ['info', 'utilities', 'media', 'rating'];
      
      groupsToHide.forEach(groupName => {
        const headings = modalContainer.querySelectorAll('h3');
        headings.forEach(heading => {
          if (heading.textContent?.toLowerCase().includes(groupName) && isInComponentModal(heading)) {
            // Hide the entire parent container/box
            let groupContainer = heading.closest('div[role="region"], div:has(h3), section, article') as HTMLElement;
            
            if (!groupContainer) {
              // Fallback: hide heading and next siblings until next heading
              (heading as HTMLElement).style.display = 'none';
              heading.setAttribute('data-smart-filter-hidden', 'true');
              
              let nextSibling = heading.nextElementSibling;
              while (nextSibling && nextSibling.tagName !== 'H3') {
                (nextSibling as HTMLElement).style.display = 'none';
                nextSibling.setAttribute('data-smart-filter-hidden', 'true');
                nextSibling = nextSibling.nextElementSibling;
              }
            } else {
              // Hide entire container/box
              groupContainer.style.display = 'none';
              groupContainer.setAttribute('data-smart-filter-hidden', 'true');
            }
            
            addLog(`❌ HIDING ENTIRE GROUP BOX: ${groupName}`);
          }
        });
      });
      
      // Hide Basic and Location buttons within contact (but keep Social) - WITH SIDEBAR PROTECTION
      const buttons = modalContainer.querySelectorAll('button');
      buttons.forEach(button => {
        const text = button.textContent?.trim();
        if ((text === 'Basic' || text === 'Location') && isInComponentModal(button)) {
          (button as HTMLElement).style.display = 'none';
          button.setAttribute('data-smart-filter-hidden', 'true');
          addLog(`❌ HIDING: ${text} button`);
        }
      });
      
      addLog(`✅ SCAMMER GROUP FILTER APPLIED! Only violation + contact.Social + review visible`);
    }
    
    // Apply MEGA separator cleanup IMMEDIATELY
    hideSeparatorsAfterHiding();
  };

  // Function to MEGA AGGRESSIVELY hide ALL separators/dividers IMMEDIATELY
  const hideSeparatorsAfterHiding = () => {
    // NO DELAY - immediate execution for faster response
    // Use same modal detection logic as main filter
    let modalContainer = document.querySelector('[data-testid="modal"], .modal, [role="dialog"]');
    
    if (!modalContainer) {
      // Use same DIRECT APPROACH as main filter
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        if (element.textContent?.includes('Pick one component')) {
          const hasComponentGroups = element.querySelector('h3') || element.querySelectorAll('h3').length > 0;
          if (hasComponentGroups) {
            modalContainer = element;
            break;
          }
          
          let parent = element.parentElement;
          while (parent && parent !== document.body) {
            const parentHasGroups = parent.querySelector('h3') || parent.querySelectorAll('h3').length > 0;
            if (parentHasGroups) {
              modalContainer = parent;
              break;
            }
            parent = parent.parentElement;
          }
          
          if (modalContainer) break;
        }
      }
    }
    
    // Use same SMART SIDEBAR PROTECTION as main filter
    if (!modalContainer) {
      const hasPickOneComponent = document.body.textContent?.includes('Pick one component');
      const hasComponentGroups = document.querySelectorAll('h3').length > 0;
      
      if (hasPickOneComponent && hasComponentGroups) {
        modalContainer = document.body;
      }
    }
    
    if (!modalContainer) {
      return;
    }
      
      // NUCLEAR APPROACH - Hide everything that could be a separator
      const allElements = modalContainer.querySelectorAll('*');
      allElements.forEach(element => {
        const htmlElement = element as HTMLElement;
        const computedStyle = window.getComputedStyle(htmlElement);
        
        // Extremely aggressive criteria for separator detection
        const isLikelySeparator = (
          // HR tags
          htmlElement.tagName === 'HR' ||
          
          // Role-based separators
          htmlElement.getAttribute('role') === 'separator' ||
          
          // Any element with visible borders
          (computedStyle.borderTopWidth && computedStyle.borderTopWidth !== '0px') ||
          (computedStyle.borderBottomWidth && computedStyle.borderBottomWidth !== '0px') ||
          (computedStyle.borderLeftWidth && computedStyle.borderLeftWidth !== '0px') ||
          (computedStyle.borderRightWidth && computedStyle.borderRightWidth !== '0px') ||
          
          // Small height elements that span width (typical separators)
          (htmlElement.offsetHeight <= 15 && htmlElement.offsetWidth > 50) ||
          
          // Elements with gray/border-like backgrounds
          computedStyle.backgroundColor === 'rgb(229, 231, 235)' || // gray-200
          computedStyle.backgroundColor === 'rgb(156, 163, 175)' || // gray-400  
          computedStyle.backgroundColor === 'rgb(209, 213, 219)' || // gray-300
          computedStyle.backgroundColor === 'rgb(107, 114, 128)' || // gray-500
          computedStyle.backgroundColor === 'rgb(75, 85, 99)' ||   // gray-600
          computedStyle.backgroundColor === 'rgba(0, 0, 0, 0.1)' ||
          computedStyle.backgroundColor === 'rgba(0, 0, 0, 0.05)' ||
          
          // Class-based detection for common separator classes
          htmlElement.className.includes('border') ||
          htmlElement.className.includes('separator') ||
          htmlElement.className.includes('divider') ||
          htmlElement.className.includes('divide') ||
          htmlElement.className.includes('line') ||
          htmlElement.className.includes('hr') ||
          htmlElement.className.includes('border-t') ||
          htmlElement.className.includes('border-b') ||
          htmlElement.className.includes('border-gray') ||
          
          // Empty divs with minimal height (spacers/separators)
          (htmlElement.tagName === 'DIV' && 
           htmlElement.children.length === 0 &&
           (!htmlElement.textContent || htmlElement.textContent.trim() === '') &&
           htmlElement.offsetHeight <= 25) ||
           
          // Elements with explicit height values that suggest separators
          computedStyle.height === '1px' ||
          computedStyle.height === '2px' ||
          computedStyle.height === '3px' ||
          computedStyle.minHeight === '1px'
        );
        
        if (isLikelySeparator) {
          htmlElement.style.display = 'none';
          htmlElement.style.visibility = 'hidden';
          htmlElement.style.height = '0';
          htmlElement.style.margin = '0';
          htmlElement.style.padding = '0';
          htmlElement.setAttribute('data-smart-filter-hidden', 'true');
          addLog(`🧹 NUCLEAR HIDING: ${htmlElement.tagName}.${htmlElement.className || 'no-class'} (${htmlElement.offsetHeight}px)`);
        }
      });
      
      // Also inject aggressive CSS to catch anything we missed
      const aggressiveStyle = document.createElement('style');
      aggressiveStyle.id = 'aggressive-separator-killer';
      aggressiveStyle.textContent = `
        /* NUCLEAR separator removal in modals */
        [data-testid="modal"] hr,
        [data-testid="modal"] .border,
        [data-testid="modal"] .border-t,
        [data-testid="modal"] .border-b,
        [data-testid="modal"] .border-l,
        [data-testid="modal"] .border-r,
        [data-testid="modal"] .border-gray-100,
        [data-testid="modal"] .border-gray-200,
        [data-testid="modal"] .border-gray-300,
        [data-testid="modal"] .border-gray-400,
        [data-testid="modal"] .divide-y > *:not(.contact-category),
        [data-testid="modal"] .divide-x > *,
        [role="dialog"] hr,
        [role="dialog"] .border,
        [role="dialog"] .border-t,
        [role="dialog"] .border-b,
        .modal hr,
        .modal .border,
        .modal .border-t,
        .modal .border-b,
        .modal .divide-y > *:not(:first-child)::before,
        .modal .divide-x > *:not(:first-child)::before {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          background: none !important;
        }
      `;
      
      // Remove existing aggressive style first
      const existingAggressive = document.getElementById('aggressive-separator-killer');
      if (existingAggressive) {
        existingAggressive.remove();
      }
      
      document.head.appendChild(aggressiveStyle);
      
      addLog('🧹 MEGA NUCLEAR separator annihilation completed IMMEDIATELY');
  };

  useEffect(() => {
    addLog('🚀 ComponentFilterCSS starting...');
    
    let modalIsOpen = false;
    
    // Setup observer for component picker modal
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            
            // Check if component picker modal opened
            if (element.textContent?.includes('Pick one component')) {
              addLog('🎯 COMPONENT PICKER DETECTED!');
              modalIsOpen = true;
              
              const currentFilter = detectListingType();
              if (currentFilter) {
                setActiveFilter(currentFilter);
                applyDOMFilter(currentFilter);
              }
            }
          }
        });
        
        // Check if modal was removed (closed)
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
    
    // Periodic check
    const interval = setInterval(() => {
      const currentFilter = detectListingType();
      
      // If filter changed
      if (currentFilter && currentFilter !== activeFilter) {
        setActiveFilter(currentFilter);
        addLog(`🔄 Filter changed to: ${currentFilter}`);
        
        // If modal is open, apply filter immediately
        if (modalIsOpen) {
          addLog('📋 Modal is open - applying filter immediately');
          applyDOMFilter(currentFilter);
        }
      }
      
      // Check if modal is currently open
      const hasModalOpen = document.querySelector('[data-testid="modal"], .modal, [role="dialog"]') !== null ||
                           (document.body.textContent?.includes('Pick one component') || false);
      
      if (hasModalOpen !== modalIsOpen) {
        modalIsOpen = hasModalOpen;
        if (modalIsOpen) {
          addLog('🎯 MODAL DETECTED via periodic check');
          if (currentFilter) {
            applyDOMFilter(currentFilter);
          }
        }
      }
    }, 500); // Check more frequently for better responsiveness

    return () => {
      clearInterval(interval);
      observer.disconnect();
      // Clean up style
      const existingStyle = document.getElementById('component-filter-css');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, [activeFilter]);

  return (
    <div style={{ 
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
        🎨 CSS COMPONENT FILTER
      </h3>
      
      <div style={{ 
        fontSize: '12px', 
        marginBottom: '8px',
        color: '#6c757d'
      }}>
        {activeFilter ? (
          <>
            <strong style={{ color: '#28a745' }}>Active Filter: {activeFilter}</strong>
            <br />
            <span>CSS Injection: {activeFilter === 'Bank' ? 'Hide all except contact.Basic+Location' : 'Hide all except violation+contact.Social+review'}</span>
          </>
        ) : (
          'Waiting for ListingType selection...'
        )}
      </div>
      
      <div style={{ 
        fontSize: '11px', 
        color: '#6c757d',
        maxHeight: '100px',
        overflowY: 'auto'
      }}>
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
};

export default ComponentFilterCSS; 