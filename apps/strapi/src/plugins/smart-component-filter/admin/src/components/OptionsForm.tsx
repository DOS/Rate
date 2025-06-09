import React, { useState, useEffect } from 'react';
import { 
  MultiSelect, 
  MultiSelectOption, 
  Field, 
  Loader, 
  Alert,
  Box,
  Typography 
} from '@strapi/design-system';
import { getFetchClient } from '@strapi/strapi/admin';

interface ComponentData {
  uid: string;
  displayName: string;
  category: string;
}

interface OptionsFormProps {
  value?: {
    allowedComponents?: string[];
  };
  onChange: (value: { allowedComponents: string[] }) => void;
}

const OptionsForm: React.FC<OptionsFormProps> = ({ value, onChange }) => {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComponents = async () => {
      try {
        const { get } = getFetchClient();
        const response = await get('/api/smart-component-filter/components');
        
        const componentsData = response.data?.data?.components || response.data?.components;
        if (componentsData && Array.isArray(componentsData)) {
          setComponents(componentsData);
        } else {
          setError('Failed to load components');
        }
      } catch (err) {
        console.error('Error fetching components:', err);
        setError('Error fetching components');
      } finally {
        setLoading(false);
      }
    };

    fetchComponents();
  }, []);

  const handleComponentsChange = (selectedComponents: string[]) => {
    onChange({
      allowedComponents: selectedComponents
    });
  };

  if (loading) {
    return (
      <Box padding={4}>
        <Loader>Loading components...</Loader>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={4}>
        <Alert variant="danger">{error}</Alert>
      </Box>
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

  return (
    <Box padding={4}>
      <Typography variant="delta" marginBottom={3}>
        Component Selection Configuration
      </Typography>
      
      <Typography variant="pi" marginBottom={4} color="neutral600">
        Choose which components should be available in this field. If none selected, all components will be shown.
      </Typography>

      <Field.Root>
        <Field.Label>Allowed Components</Field.Label>
        <MultiSelect
          placeholder="Select components to allow (leave empty for all)"
          value={value?.allowedComponents || []}
          onChange={handleComponentsChange}
          withTags
        >
          {sortedCategories.map(category => (
            <React.Fragment key={category}>
              <MultiSelectOption 
                value={`category-${category}`} 
                disabled
                style={{ 
                  fontWeight: 'bold', 
                  color: '#666',
                  backgroundColor: '#f6f6f9'
                }}
              >
                {category.toUpperCase()}
              </MultiSelectOption>
              {groupedComponents[category].map(component => (
                <MultiSelectOption 
                  key={component.uid} 
                  value={component.uid}
                  style={{ paddingLeft: '20px' }}
                >
                  {component.displayName}
                </MultiSelectOption>
              ))}
            </React.Fragment>
          ))}
        </MultiSelect>
        <Field.Hint>
          Selected components will be the only ones available in this field. 
          Smart filtering will still apply based on ListingType.
        </Field.Hint>
      </Field.Root>
    </Box>
  );
};

export default OptionsForm; 