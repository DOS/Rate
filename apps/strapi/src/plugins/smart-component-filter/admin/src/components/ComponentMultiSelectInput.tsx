import React, { useState, useEffect } from 'react';
import {
  Field,
  MultiSelect,
  MultiSelectOption,
  Typography,
  Box,
  Divider,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

interface Component {
  uid: string;
  displayName: string;
  category: string;
}

interface ComponentsByCategory {
  [category: string]: Component[];
}

interface ComponentMultiSelectInputProps {
  name: string;
  value?: string | string[];
  onChange: (value: { target: { name: string; value: string; type: string } }) => void;
  intlLabel?: { id: string; defaultMessage: string };
  description?: { id: string; defaultMessage: string };
  error?: string;
  required?: boolean;
  attribute?: { type: string };
}

const ComponentMultiSelectInput = React.forwardRef<HTMLInputElement, ComponentMultiSelectInputProps>((props, ref) => {
  const {
    name,
    value = '',
    onChange,
    intlLabel,
    description,
    error,
    required = false,
    attribute,
  } = props;

  const [components, setComponents] = useState<Component[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [componentsByCategory, setComponentsByCategory] = useState<ComponentsByCategory>({});
  const { get } = useFetchClient();

  // Fetch all components from Strapi
  useEffect(() => {
    const fetchComponents = async () => {
      try {
        console.log('🔍 Fetching components from Strapi...');
        const { data } = await get('/content-type-builder/components');
        console.log('📦 Raw API response:', data);
        
        const allComponents: Component[] = [];
        
        // Parse components from Strapi response
        if (data && data.data) {
          data.data.forEach((componentData: any, index: number) => {
            console.log(`🧩 Processing component: ${index}`, componentData);
            if (componentData && componentData.schema && componentData.uid) {
              const [category, name] = componentData.uid.split('.');
              allComponents.push({
                uid: componentData.uid,
                displayName: componentData.schema.displayName || name,
                category: category || 'other',
              });
            }
          });
        }

        console.log(`✅ Found ${allComponents.length} components:`, allComponents);

        // Sort components by category and name
        allComponents.sort((a, b) => {
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.displayName.localeCompare(b.displayName);
        });

        // Filter out unwanted categories (keep only relevant ones)
        const filteredComponents = allComponents.filter(component => 
          ['contact', 'info', 'media', 'rating', 'review', 'violation'].includes(component.category)
        );

        console.log(`🔍 Filtered from ${allComponents.length} to ${filteredComponents.length} components`);

        // Group by category
        const grouped: ComponentsByCategory = {};
        filteredComponents.forEach((component) => {
          if (!grouped[component.category]) {
            grouped[component.category] = [];
          }
          grouped[component.category].push(component);
        });

        console.log('📂 Grouped by category:', grouped);

        setComponents(filteredComponents);
        setComponentsByCategory(grouped);
      } catch (error) {
        console.error('❌ Failed to fetch components:', error);
        // Fallback to empty state
        setComponents([]);
        setComponentsByCategory({});
      }
    };

    fetchComponents();
  }, [get]);

  // Parse value
  useEffect(() => {
    if (typeof value === 'string' && value) {
      try {
        const parsed = JSON.parse(value);
        setSelectedComponents(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSelectedComponents(value.split(',').filter(Boolean));
      }
    } else if (Array.isArray(value)) {
      setSelectedComponents(value);
    } else {
      setSelectedComponents([]);
    }
  }, [value]);

  const handleChange = (newValue: string[]) => {
    setSelectedComponents(newValue);
    onChange({
      target: {
        name,
        value: JSON.stringify(newValue),
        type: attribute?.type || 'string',
      },
    });
  };

  // Get selected components with full display format
  const getSelectedComponentDisplay = (uid: string) => {
    const component = components.find(c => c.uid === uid);
    if (!component) return uid;
    return `${component.category.charAt(0).toUpperCase() + component.category.slice(1)} • ${component.displayName}`;
  };

  return (
    <Field.Root name={name} error={error} required={required}>
      <Field.Label>{intlLabel?.defaultMessage || name}</Field.Label>
      <MultiSelect
        placeholder={`Select components for ${name}...`}
        value={selectedComponents}
        onChange={handleChange}
        withTags
        customizeContent={(value) => getSelectedComponentDisplay(value)}
      >
        {Object.keys(componentsByCategory)
          .sort()
          .map((category) => (
            <React.Fragment key={category}>
              <Box padding={2} background="neutral100">
                <Typography variant="sigma" textColor="neutral600">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Typography>
              </Box>
              {componentsByCategory[category].map((component) => (
                <MultiSelectOption key={component.uid} value={component.uid}>
                  {component.displayName}
                </MultiSelectOption>
              ))}
            </React.Fragment>
          ))}
      </MultiSelect>
      {description && (
        <Field.Hint>{description.defaultMessage}</Field.Hint>
      )}
      <Field.Error />
    </Field.Root>
  );
});

ComponentMultiSelectInput.displayName = 'ComponentMultiSelectInput';

export { ComponentMultiSelectInput };
export default ComponentMultiSelectInput; 