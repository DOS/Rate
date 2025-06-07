import React, { useState, useEffect } from 'react';
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
  name,
  onChange,
  required = false,
  value = []
}) => {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
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

  const labelText = intlLabel?.defaultMessage || 'Component Multi-Select';

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
        {components.map((component) => (
          <MultiSelectOption key={component.uid} value={component.uid}>
            {component.displayName} ({component.category})
          </MultiSelectOption>
        ))}
      </MultiSelect>
      {error && <Field.Error>{error}</Field.Error>}
      <Field.Hint>
        Smart Component Filter v2.0.2 - Native Strapi MultiSelect with dynamic components from database
      </Field.Hint>
    </Field.Root>
  );
};

export default ComponentMultiSelectInput; 