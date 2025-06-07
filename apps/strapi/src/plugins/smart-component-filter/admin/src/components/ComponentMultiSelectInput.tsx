import { useState, useEffect, Fragment } from 'react';
import { MultiSelect, MultiSelectOption, Loader, Alert, Field } from '@strapi/design-system';
import { getFetchClient } from '@strapi/strapi/admin';

interface ComponentData {
  uid: string;
  displayName: string;
  category: string;
}

interface ComponentMultiSelectInputProps {
  attribute: any;
  disabled?: boolean;
  error?: string;
  intlLabel?: { defaultMessage: string };
  labelAction?: any;
  name: string;
  onChange: (event: { target: { name: string; value: string[] } }) => void;
  required?: boolean;
  value?: string[];
  // Additional Strapi props that might contain field metadata
  contentTypeUID?: string;
  fieldSchema?: any;
  metadatas?: any;
}

const ComponentMultiSelectInput = ({
  attribute,
  disabled = false,
  error,
  intlLabel,
  labelAction,
  name,
  onChange,
  required = false,
  value = [],
  contentTypeUID,
  fieldSchema,
  metadatas
}) => {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // Debug: Log all props to understand what's available
    console.log('🔍 ComponentMultiSelectInput props:', {
      name,
      intlLabel,
      metadatas,
      fieldSchema,
      contentTypeUID,
      attribute
    });

    const fetchComponents = async () => {
      try {
        console.log('🔍 Fetching components from API...');
        const { get } = getFetchClient();
        const response = await get('/api/smart-component-filter/components');
        
        if (response.data?.success && response.data?.data?.components) {
          console.log('✅ Components loaded:', response.data.data.components);
          setComponents(response.data.data.components);
          setFetchError(null);
        } else {
          console.error('❌ Failed to load components:', response.data);
          setFetchError('Failed to load components');
        }
      } catch (error) {
        console.error('❌ Error fetching components:', error);
        setFetchError('Error fetching components');
      } finally {
        setLoading(false);
      }
    };

    fetchComponents();
  }, []);

  const handleChange = (selectedValues: string[]) => {
    console.log('🎯 MultiSelect changed:', selectedValues);
    onChange({
      target: {
        name,
        value: selectedValues
      }
    });
  };

  // Try to get field name from various sources
  const getFieldLabel = () => {
    // 1. Try intlLabel first (from field configuration)
    if (intlLabel?.defaultMessage) {
      return intlLabel.defaultMessage;
    }
    
    // 2. Try metadatas (Strapi field metadata)
    if (metadatas?.label) {
      return metadatas.label;
    }
    
    // 3. Try fieldSchema (field definition)
    if (fieldSchema?.displayName) {
      return fieldSchema.displayName;
    }
    
    // 4. Use field name as fallback (capitalize first letter)
    if (name) {
      return name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, ' $1').trim();
    }
    
    // 5. Final fallback
    return 'Component Multi-Select';
  };

  const labelText = getFieldLabel();

  if (loading) {
    return (
      <Field.Root name={name} required={required}>
        <Field.Label>{labelText}</Field.Label>
        <Loader>Loading components...</Loader>
      </Field.Root>
    );
  }

  if (fetchError) {
    return (
      <Field.Root name={name} required={required}>
        <Field.Label>{labelText}</Field.Label>
        <Alert variant="danger">{fetchError}</Alert>
      </Field.Root>
    );
  }

  // Group components by category and sort
  const groupedComponents = components.reduce((acc, component) => {
    if (!acc[component.category]) {
      acc[component.category] = [];
    }
    acc[component.category].push(component);
    return acc;
  }, {} as Record<string, ComponentData[]>);

  // Sort categories alphabetically and components within each category
  const sortedCategories = Object.keys(groupedComponents).sort();
  sortedCategories.forEach(category => {
    groupedComponents[category].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  return (
    <Field.Root name={name} required={required} error={error}>
      <Field.Label>{labelText}</Field.Label>
      <MultiSelect
        value={value}
        onChange={handleChange}
        disabled={disabled}
        placeholder="Select components..."
        withTags
      >
        {sortedCategories.map((category) => (
          <Fragment key={category}>
            {/* Components in this category with clean category prefix */}
            {groupedComponents[category].map((component) => (
              <MultiSelectOption key={component.uid} value={component.uid}>
                {category.charAt(0).toUpperCase() + category.slice(1)} • {component.displayName}
              </MultiSelectOption>
            ))}
          </Fragment>
        ))}
      </MultiSelect>
      {error && <Field.Error>{error}</Field.Error>}
      <Field.Hint>
        Smart Component Filter v2.0.3 - Native Strapi MultiSelect with clean category display
      </Field.Hint>
    </Field.Root>
  );
};

export default ComponentMultiSelectInput; 