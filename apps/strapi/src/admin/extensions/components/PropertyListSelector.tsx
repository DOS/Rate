import React, { useState, useEffect } from 'react';
import { MultiSelect, MultiSelectOption, Field } from '@strapi/design-system';

interface PropertyListSelectorProps {
  name: string;
  value?: string[] | string | null;
  onChange?: (e: { target: { name: string; value: string[] | null; type: string } }) => void;
  required?: boolean;
  attribute?: any;
  description?: string;
  placeholder?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  error?: string;
}

const PropertyListSelector: React.FC<PropertyListSelectorProps> = ({
  name,
  value = null,
  onChange,
  required = false,
  attribute,
  description,
  placeholder,
  label = 'Property Components',
  hint,
  disabled = false,
  error,
}) => {
  const [options, setOptions] = useState<MultiSelectOption[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  // Parse incoming value
  useEffect(() => {
    if (Array.isArray(value)) {
      setSelectedValues(value);
    } else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        setSelectedValues(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSelectedValues([]);
      }
    } else {
      setSelectedValues([]);
    }
  }, [value]);

  // Fetch available components
  useEffect(() => {
    fetch('/admin/property-components/list')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.components)) {
          setOptions(data.components);
        }
      })
      .catch(err => {
        console.error('Failed to load property components:', err);
        // Fallback to hardcoded list
        setOptions([
          { label: 'Battery', value: 'property.battery' },
          { label: 'Camera', value: 'property.camera' },
          { label: 'Connectivity', value: 'property.connectivity' },
          { label: 'Design', value: 'property.design' },
          { label: 'Display', value: 'property.display' },
          { label: 'Hardware', value: 'property.hardware' },
        ]);
      });
  }, []);

  const handleChange = (values: string[]) => {
    setSelectedValues(values);
    if (onChange) {
      onChange({
        target: {
          name,
          value: values.length > 0 ? values : null,
          type: 'json',
        },
      });
    }
  };

  return (
    <Field
      name={name}
      hint={hint || 'Select which property components to auto-generate for items in this category'}
      error={error}
      required={required}
    >
      <MultiSelect
        label={label}
        placeholder={placeholder || 'Select property components'}
        disabled={disabled}
        value={selectedValues}
        onChange={handleChange}
        onClear={() => handleChange([])}
        withTags
      >
        {options.map((option) => (
          <MultiSelectOption key={option.value} value={option.value}>
            {option.label}
          </MultiSelectOption>
        ))}
      </MultiSelect>
    </Field>
  );
};

export default PropertyListSelector;
