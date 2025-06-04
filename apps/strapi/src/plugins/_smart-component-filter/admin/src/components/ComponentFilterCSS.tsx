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
    addLog(`🎯 APPLYING DOM FILTER for ${listingType}`);
    
    // Wait for modal to render
    setTimeout(() => {
      // First, reset all styles (show everything)
      const allElements = document.querySelectorAll('h3, button, [role="separator"], hr');
      allElements.forEach(element => {
        (element as HTMLElement).style.display = '';
      });
      
      if (listingType === 'Bank') {
        // Bank: Hide all categories except contact, and hide Social within contact
        const categoriesToHide = ['info', 'violation', 'utilities', 'media', 'review', 'rating'];
        
        categoriesToHide.forEach(category => {
          // Find heading by text content
          const headings = document.querySelectorAll('h3');
          headings.forEach(heading => {
            if (heading.textContent?.toLowerCase().includes(category)) {
              (heading as HTMLElement).style.display = 'none';
              addLog(`❌ HIDING: ${category}`);
            }
          });
        });
        
        // Hide Social button within contact
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
          if (button.textContent?.trim() === 'Social') {
            (button as HTMLElement).style.display = 'none';
            addLog(`❌ HIDING: Social button`);
          }
        });
        
        // Hide separators/dividers after hidden elements
        hideSeparators();
        
        addLog(`✅ BANK FILTER APPLIED! Only contact.Basic + contact.Location visible`);
        
      } else if (listingType === 'Scammer') {
        // Scammer: Hide specific categories and components
        const categoriesToHide = ['info', 'utilities', 'media', 'rating'];
        
        categoriesToHide.forEach(category => {
          const headings = document.querySelectorAll('h3');
          headings.forEach(heading => {
            if (heading.textContent?.toLowerCase().includes(category)) {
              (heading as HTMLElement).style.display = 'none';
              addLog(`❌ HIDING: ${category}`);
            }
          });
        });
        
        // Hide Basic and Location buttons within contact
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
          const text = button.textContent?.trim();
          if (text === 'Basic' || text === 'Location') {
            (button as HTMLElement).style.display = 'none';
            addLog(`❌ HIDING: ${text} button`);
          }
        });
        
        // Hide separators/dividers after hidden elements
        hideSeparators();
        
        addLog(`✅ SCAMMER FILTER APPLIED! Only violation + contact.Social + review visible`);
      }
    }, 200);
  };
  
  // Function to hide separators between groups
  const hideSeparators = () => {
    // Hide horizontal lines/separators
    const separators = document.querySelectorAll('[role="separator"], hr, .separator');
    separators.forEach(separator => {
      const parent = separator.parentElement;
      if (parent) {
        // Check if the separator is between hidden elements
        const siblings = Array.from(parent.children);
        const separatorIndex = siblings.indexOf(separator as Element);
        
        // Check if previous or next sibling is hidden
        const prevSibling = siblings[separatorIndex - 1] as HTMLElement;
        const nextSibling = siblings[separatorIndex + 1] as HTMLElement;
        
        if ((prevSibling && prevSibling.style.display === 'none') || 
            (nextSibling && nextSibling.style.display === 'none')) {
          (separator as HTMLElement).style.display = 'none';
          addLog(`❌ HIDING: separator`);
        }
      }
    });
    
    // Also hide empty divs and spacing elements
    const spacingElements = document.querySelectorAll('div[style*="height"], div[style*="margin"], div[style*="padding"]');
    spacingElements.forEach(element => {
      const htmlElement = element as HTMLElement;
      if (htmlElement.children.length === 0 && htmlElement.textContent?.trim() === '') {
        htmlElement.style.display = 'none';
      }
    });
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