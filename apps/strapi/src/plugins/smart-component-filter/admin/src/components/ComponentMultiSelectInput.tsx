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

  // Custom hook to add category prefix to selected tags
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        // Find all selected tags in this MultiSelect instance
        const multiSelectContainer = document.querySelector(`[data-field-name="${name}"]`);
        if (!multiSelectContainer) return;

        const tags = multiSelectContainer.querySelectorAll('[data-strapi-field-tag]');
        
        tags.forEach((tag: Element) => {
          const tagElement = tag as HTMLElement;
          const tagValue = tagElement.getAttribute('data-value') || tagElement.textContent?.trim();
          
          if (tagValue) {
            // Find the component data for this tag
            const component = components.find(comp => comp.uid === tagValue);
            if (component) {
              const categoryName = component.category.charAt(0).toUpperCase() + component.category.slice(1);
              const newText = `${categoryName} - ${component.displayName}`;
              
              // Only update if not already updated
              if (tagElement.textContent !== newText) {
                tagElement.textContent = newText;
              }
            }
          }
        });
      } catch (error) {
        console.warn(`[${uniqueFieldName}] Error updating tag display:`, error);
      }
    }, 100); // Small delay to ensure DOM is ready

    return () => clearTimeout(timer);
  }, [cleanValue, components, name, uniqueFieldName]);

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
      <div data-field-name={name}>
        <MultiSelect
          value={cleanValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder="Select components for this listing type..."
          withTags
          key={name}
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
                data-category={component.category}
                data-display-name={component.displayName}
              >
                {component.displayName}
              </MultiSelectOption>
            ))}
          </Fragment>
        ))}
        </MultiSelect>
      </div>
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