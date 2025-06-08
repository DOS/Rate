import React, { useEffect, useState } from 'react';
import { getFetchClient, unstable_useContentManagerContext as useContentManagerContext } from '@strapi/strapi/admin';

interface DynamicZoneOverrideProps {
  name: string;
  value: any[];
  onChange: (value: any[]) => void;
  attribute: any;
  [key: string]: any;
}

const DynamicZoneOverride: React.FC<DynamicZoneOverrideProps> = (props) => {
  const { attribute, name, ...otherProps } = props;
  const [allowedComponents, setAllowedComponents] = useState<string[]>([]);
  const [originalComponents] = useState(attribute?.components || []);
  
  // Get form data from Content Manager using correct v5 hook
  const contentManagerContext = useContentManagerContext();
  const form = contentManagerContext?.form as any; // Type assertion for now since it's experimental
  const selectedListingTypeId = form?.values?.ListingType?.data?.id || form?.values?.ListingType;

  useEffect(() => {
    const fetchAllowedComponents = async () => {
      if (!selectedListingTypeId) {
        // If no ListingType selected, show all components
        setAllowedComponents(originalComponents);
        return;
      }

      try {
        const { get } = getFetchClient();
        console.log('🎯 DynamicZone: Fetching components for listing type:', selectedListingTypeId);
        
        const response = await get(
          `/api/smart-component-filter/listing-type/${selectedListingTypeId}/components`
        );
        
        if (response.data?.success) {
          const components = response.data.data?.allowedComponents || [];
          console.log('🎯 DynamicZone: Allowed components:', components);
          setAllowedComponents(components);
        } else {
          console.error('🎯 DynamicZone: API did not return success:', response.data);
          setAllowedComponents(originalComponents);
        }
      } catch (error) {
        console.error('🎯 DynamicZone: Failed to fetch allowed components:', error);
        setAllowedComponents(originalComponents);
      }
    };

    fetchAllowedComponents();
  }, [selectedListingTypeId, originalComponents]);

  // Create filtered attribute
  const filteredAttribute = React.useMemo(() => {
    if (!allowedComponents.length) {
      return attribute;
    }
    
    return {
      ...attribute,
      components: allowedComponents
    };
  }, [attribute, allowedComponents]);

  // For now, let's create a simple override component instead of trying to import original
  // Dynamic Zone component (which might be complex to import properly)
  const isFiltered = allowedComponents.length > 0 && allowedComponents.length < originalComponents.length;
  
  return (
    <div>
      {isFiltered && (
        <div style={{ 
          padding: '8px 12px', 
          background: '#e6f7ff', 
          border: '1px solid #91d5ff',
          borderRadius: '4px', 
          marginBottom: '8px',
          fontSize: '12px',
          color: '#1890ff'
        }}>
          🎯 Smart Filter Active: Showing {allowedComponents.length} of {originalComponents.length} components
          {selectedListingTypeId && (
            <span> for ListingType ID: {selectedListingTypeId}</span>
          )}
        </div>
      )}
      
      {/* For now, show a simple message that filtering is active */}
      <div style={{ 
        padding: '16px', 
        border: '2px dashed #ddd', 
        borderRadius: '4px',
        background: '#f8f9fa',
        textAlign: 'center'
      }}>
        <p style={{ margin: 0, color: '#666' }}>
          🎯 Smart Component Filter is intercepting Dynamic Zone for field "{name}"
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#888' }}>
          Filtered components: {allowedComponents.join(', ') || 'All components'}
        </p>
        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#aaa' }}>
          Note: This is a proof-of-concept. Full dynamic zone override requires deeper Strapi integration.
        </p>
      </div>
    </div>
  );
};

export default DynamicZoneOverride; 