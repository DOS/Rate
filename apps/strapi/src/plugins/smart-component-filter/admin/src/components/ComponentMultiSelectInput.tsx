import React, { useState, useEffect, Fragment, useId } from 'react';
import { MultiSelect, MultiSelectOption, Loader, Alert, Field } from '@strapi/design-system';
import { getFetchClient } from '@strapi/strapi/admin';

interface ComponentData {
  uid: string;
  displayName: string;
  category: string;
}

interface ComponentMultiSelectInputProps {
  attribute?: any;
  disabled?: boolean;
  error?: string;
  intlLabel?: { defaultMessage: string };
  labelAction?: any;
  name: string;
  onChange: (event: { target: { name: string; value: string[] } }) => void;
  required?: boolean;
  value?: string[];
}

const ComponentMultiSelectInput: React.FC<ComponentMultiSelectInputProps> = ({
  attribute,
  disabled = false,
  error,
  intlLabel,
  labelAction,
  name,
  onChange,
  required = false,
  value = []
}) => {
  // Generate unique ID for this instance
  const instanceId = useId();
  const uniqueFieldName = `${name}-${instanceId}`;
  
  // Clean and validate incoming value prop to handle corrupted data from old entries
  const cleanValue = React.useMemo(() => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(val => val && typeof val === 'string' && !val.startsWith('header-'));
    }
    // Handle corrupted string values (comma-separated, etc.)
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(val => val && typeof val === 'string') : [];
      } catch {
        return (value as string).split(',').map((v: string) => v.trim()).filter((v: string) => v);
      }
    }
    return [];
  }, [value]);
  
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Mock data fallback
  const mockComponents: ComponentData[] = [
    { uid: 'contact.basic', displayName: 'Basic', category: 'contact' },
    { uid: 'contact.photo', displayName: 'Photo', category: 'contact' },
    { uid: 'info.description', displayName: 'Description', category: 'info' },
    { uid: 'rating.pros-cons', displayName: 'ProsCons', category: 'rating' },
    { uid: 'review.rating', displayName: 'Rating', category: 'review' },
    { uid: 'media.photo', displayName: 'Photo', category: 'media' }
  ];

  useEffect(() => {
    const fetchComponents = async () => {
      try {
        const { get } = getFetchClient();
        const response = await get('/api/smart-component-filter/components');
        
        const componentsData = response.data?.data?.components || response.data?.components || mockComponents;
        
        if (Array.isArray(componentsData)) {
          setComponents(componentsData);
          setFetchError(null);
        } else {
          setComponents(mockComponents);
          setFetchError(null);
        }
      } catch (error) {
        console.warn(`[${uniqueFieldName}] Using mock data due to API error:`, error);
        setComponents(mockComponents);
        setFetchError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchComponents();
  }, [uniqueFieldName]);

  const handleChange = (selectedValues: string[]) => {
    try {
      // Clean and validate selected values
      const cleanValues = Array.isArray(selectedValues) 
        ? selectedValues.filter(val => val && typeof val === 'string' && !val.startsWith('header-'))
        : [];
      
      // Ensure proper event format for Strapi form validation
      const event = {
        target: {
          name: name, // Use original name, not uniqueFieldName
          value: cleanValues,
          type: 'custom-field'
        }
      };
      
      console.log(`[${uniqueFieldName}] Change event:`, event);
      onChange(event);
    } catch (error) {
      console.error(`[${uniqueFieldName}] Error in handleChange:`, error);
      // Fallback: send empty array to prevent form corruption
      onChange({
        target: {
          name: name,
          value: []
        }
      });
    }
  };

  const getLabelText = () => {
    return intlLabel?.defaultMessage || name || 'Component Multi-Select';
  };

  if (loading) {
    return (
      <Field.Root name={name} required={required}>
        <Field.Label>{getLabelText()}</Field.Label>
        <Loader>Loading components...</Loader>
      </Field.Root>
    );
  }

  if (fetchError) {
    return (
      <Field.Root name={name} required={required}>
        <Field.Label>{getLabelText()}</Field.Label>
        <Alert variant="danger">{fetchError}</Alert>
      </Field.Root>
    );
  }

  // Group components by category
  const groupedComponents = components.reduce((acc, component) => {
    if (!acc[component.category]) {
      acc[component.category] = [];
    }
    acc[component.category].push(component);
    return acc;
  }, {} as Record<string, ComponentData[]>);

  // Sort categories and components
  const sortedCategories = Object.keys(groupedComponents).sort();
  sortedCategories.forEach(category => {
    groupedComponents[category].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  const selectedCount = cleanValue?.length || 0;

  return (
    <Field.Root name={name} required={required} error={error}>
      <Field.Label action={labelAction}>{getLabelText()}</Field.Label>
      <MultiSelect
        value={cleanValue}
        onChange={handleChange}
        disabled={disabled}
        placeholder="Chọn components cho listing type này..."
        withTags
        key={name}
        customizeContent={(value: string) => {
          // Find the component and its category for selected values
          const component = Object.values(groupedComponents)
            .flat()
            .find(comp => comp.uid === value);
          
          if (component) {
            const category = component.category.charAt(0).toUpperCase() + component.category.slice(1);
            return `${category} - ${component.displayName}`;
          }
          return value;
        }}
      >
        {sortedCategories.map((category) => (
          <Fragment key={`${uniqueFieldName}-${category}`}>
            <div 
              style={{ 
                fontWeight: 'bold', 
                backgroundColor: '#f6f6f9', 
                color: '#32324d',
                cursor: 'default',
                pointerEvents: 'none',
                padding: '8px 12px',
                borderBottom: '1px solid #e6e6e6',
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              {category.toUpperCase()}
            </div>
            {groupedComponents[category].map((component) => (
              <MultiSelectOption 
                key={`${uniqueFieldName}-${component.uid}`} 
                value={component.uid}
              >
                {component.displayName}
              </MultiSelectOption>
            ))}
          </Fragment>
        ))}
      </MultiSelect>
      {selectedCount > 0 && (
        <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
          Selected: {selectedCount} components
        </div>
      )}
      {error && <Field.Error>{error}</Field.Error>}
    </Field.Root>
  );
};

export default ComponentMultiSelectInput; 