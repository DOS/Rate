import React, { useEffect, useState } from 'react';

const ComponentFilterSimple: React.FC = () => {
  const [selectedListingType, setSelectedListingType] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `${timestamp}: ${message}`;
    setLogs(prev => [...prev.slice(-4), logMessage]);
    console.log('[ComponentFilter]', logMessage);
  };

  // Hardcoded component mapping
  const componentMapping = {
    'Bank': ['contact.Basic', 'contact.Location'], // Bank chỉ show Basic và Location
    'Scammer': ['violation', 'contact.Social']     // Scammer chỉ show violation và Social
  };

  // Function to detect ListingType selection
  const detectListingType = () => {
    // Look for Bank button by iterating through all buttons
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      if (button.textContent?.includes('Bank')) {
        addLog('✅ DETECTED: Bank selected (button)');
        return 'Bank';
      }
      if (button.textContent?.includes('Scammer')) {
        addLog('✅ DETECTED: Scammer selected (button)');
        return 'Scammer';
      }
    }

    // Look for ListingType text in the page
    const pageText = document.body.textContent || '';
    if (pageText.includes('Bank') && pageText.includes('Published')) {
      addLog('✅ DETECTED: Bank via page text');
      return 'Bank';
    }
    if (pageText.includes('Scammer') && pageText.includes('Published')) {
      addLog('✅ DETECTED: Scammer via page text');
      return 'Scammer';
    }

    return '';
  };

  // Function to apply component filtering
  const applyFilter = (listingType: string) => {
    const allowedComponents = componentMapping[listingType as keyof typeof componentMapping];
    if (!allowedComponents) {
      addLog(`❌ No mapping found for ${listingType}`);
      return;
    }

    addLog(`🎯 Applying filter for ${listingType}: ${allowedComponents.join(', ')}`);

    // Wait for component picker modal to appear
    const checkModal = setInterval(() => {
      const modal = document.querySelector('[role="dialog"], .modal, [class*="modal"]');
      if (modal && modal.textContent?.includes('Pick one component')) {
        addLog('🔍 Component picker modal detected');
        clearInterval(checkModal);

        // Hide all components first
        const allHeadings = modal.querySelectorAll('h3, h4, [role="heading"]');
        allHeadings.forEach(heading => {
          const container = heading.closest('div, section, article');
          if (container) {
            (container as HTMLElement).style.display = 'none';
          }
        });

        // Show only allowed components
        let visibleCount = 0;
        allowedComponents.forEach(component => {
          const [category, specific] = component.split('.');
          
          // Find category heading
          const categoryHeading = Array.from(allHeadings).find(h => 
            h.textContent?.toLowerCase().includes(category.toLowerCase())
          );
          
          if (categoryHeading) {
            const container = categoryHeading.closest('div, section, article');
            if (container) {
              (container as HTMLElement).style.display = 'block';
              visibleCount++;
              
              // If specific component specified, hide others
              if (specific) {
                const buttons = container.querySelectorAll('button');
                buttons.forEach(btn => {
                  if (!btn.textContent?.toLowerCase().includes(specific.toLowerCase())) {
                    (btn as HTMLElement).style.display = 'none';
                  }
                });
              }
            }
          }
        });

        addLog(`✅ Filter applied! Showing ${visibleCount} categories`);
      }
    }, 100);

    // Clear after 5 seconds to avoid memory leaks
    setTimeout(() => clearInterval(checkModal), 5000);
  };

  useEffect(() => {
    addLog('🚀 SimpleFilter starting...');

    // Initial detection
    const initialType = detectListingType();
    if (initialType) {
      setSelectedListingType(initialType);
    }

    // Set up mutation observer for DOM changes
    const observer = new MutationObserver(() => {
      const detectedType = detectListingType();
      if (detectedType && detectedType !== selectedListingType) {
        setSelectedListingType(detectedType);
        addLog(`🔄 ListingType changed to: ${detectedType}`);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Listen for component picker button clicks
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.textContent?.includes('Add a component') || target.textContent?.includes('component')) {
        addLog('🎯 Component picker triggered');
        if (selectedListingType) {
          setTimeout(() => applyFilter(selectedListingType), 200);
        }
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick);
    };
  }, [selectedListingType]);

  return (
    <div style={{
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '16px',
      marginTop: '16px'
    }}>
      <h3 style={{ 
        fontSize: '16px', 
        fontWeight: 'bold', 
        marginBottom: '12px',
        color: selectedListingType ? '#28a745' : '#6c757d'
      }}>
        🎯 SIMPLE COMPONENT FILTER
      </h3>
      
      {selectedListingType ? (
        <div style={{
          backgroundColor: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
          padding: '8px',
          marginBottom: '12px'
        }}>
          <strong>Active Filter: {selectedListingType}</strong>
          <div style={{ fontSize: '12px', color: '#155724' }}>
            Allowed: {componentMapping[selectedListingType as keyof typeof componentMapping]?.join(', ')}
          </div>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '4px',
          padding: '8px',
          marginBottom: '12px',
          fontSize: '14px'
        }}>
          Waiting for ListingType selection...
        </div>
      )}

      <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
        {logs.map((log, index) => (
          <div key={index} style={{ marginBottom: '2px', color: '#495057' }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComponentFilterSimple; 