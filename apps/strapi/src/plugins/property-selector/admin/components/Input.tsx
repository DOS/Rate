import React, { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { MultiSelect, MultiSelectOption, Field } from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

interface InputProps {
  name: string;
  value?: string[] | string;
  onChange: (e: { target: { name: string; value: string[]; type: string } }) => void;
  attribute?: any;
  description?: { id: string; defaultMessage: string };
  placeholder?: { id: string; defaultMessage: string };
  label?: string;
  hint?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

const Input: React.FC<InputProps> = ({
  name,
  value,
  onChange,
  attribute,
  description,
  placeholder,
  label,
  hint,
  disabled = false,
  error,
  required = false,
}) => {
  const { formatMessage } = useIntl();
  const { get } = useFetchClient();
  const [options, setOptions] = useState<MultiSelectOption[]>([]);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  // Parse value
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
    const fetchComponents = async () => {
      try {
        const { data } = await get('/property-selector/components');

        if (data && Array.isArray(data.components)) {
          const componentOptions = data.components.map((comp: string) => ({
            label: comp.replace('property.', '').charAt(0).toUpperCase() +
                   comp.replace('property.', '').slice(1),
            value: comp,
          }));
          setOptions(componentOptions);
        }
      } catch (err) {
        console.error('Failed to load property components:', err);

        // Fallback: get from global strapi object if available
        if (typeof window !== 'undefined' && (window as any).strapi?.components) {
          const components = Object.keys((window as any).strapi.components)
            .filter((key: string) => key.startsWith('property.'))
            .sort();

          setOptions(components.map((comp: string) => ({
            label: comp.replace('property.', '').charAt(0).toUpperCase() +
                   comp.replace('property.', '').slice(1),
            value: comp,
          })));
        }
      }
    };

    fetchComponents();
  }, [get]);

  const handleChange = (values: string[]) => {
    setSelectedValues(values);
    onChange({
      target: {
        name,
        value: values,
        type: attribute?.type || 'json',
      },
    });
  };

  return (
    <Field
      name={name}
      hint={hint || formatMessage({
        id: 'property-selector.hint',
        defaultMessage: 'Select property components to auto-generate for items in this category',
      })}
      error={error}
      required={required}
    >
      <MultiSelect
        label={label || formatMessage({
          id: 'property-selector.label',
          defaultMessage: 'Property Components',
        })}
        placeholder={placeholder ? formatMessage(placeholder) : 'Select components...'}
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

export default Input;
