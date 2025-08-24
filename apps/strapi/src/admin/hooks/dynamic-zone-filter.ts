import { useEffect } from 'react';

/**
 * Hook to filter dynamic zone components based on listing type selection
 * This intercepts the dynamic zone component picker and filters components
 * using the Smart Component Filter API
 */
export function useDynamicZoneFilter() {
  useEffect(() => {
    console.log('🔍 [Dynamic Zone Filter] Hook disabled - no filtering applied');
    // All dynamic zone filtering functionality has been disabled
  }, []);
}

export default useDynamicZoneFilter; 