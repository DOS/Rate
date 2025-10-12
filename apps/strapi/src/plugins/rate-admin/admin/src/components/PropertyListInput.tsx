import React, { useEffect, useState, useMemo } from 'react';
import { Field, Flex, MultiSelect, MultiSelectOption } from '@strapi/design-system';
import { useField } from '@strapi/strapi/admin';
import { useFetchClient } from '@strapi/strapi/admin';

interface PropertyListInputProps {
  name: string;
  intlLabel: any;
  disabled?: boolean;
  hint?: string;
  label?: string;
  description?: any;
  required?: boolean;
  attribute?: any;
  placeholder?: string;
}

const PropertyListInput = ({
  name,
  intlLabel,
  disabled = false,
  hint,
  label,
  description,
  required = false,
  attribute,
  placeholder,
}: PropertyListInputProps) => {
  const { onChange, value, error } = useField(name);
  const { get } = useFetchClient();
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComponents = async () => {
      try {
        const response = await get('/rate-admin/property-components');
        const components = response.data.components || [];
        setOptions(components);
      } catch (err) {
        console.error('Failed to fetch property components:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchComponents();
  }, [get]);

  const sanitizedValue = useMemo(() => {
    let parsedValue;
    try {
      parsedValue = typeof value !== 'string' ? value || [] : JSON.parse(value || '[]');
    } catch (e) {
      parsedValue = [];
    }
    return Array.isArray(parsedValue) ? parsedValue : [];
  }, [value]);

  const handleChange = (selectedValues: string[]) => {
    onChange({
      target: {
        name,
        value: selectedValues && selectedValues.length > 0
          ? JSON.stringify(selectedValues)
          : null,
        type: attribute?.type || 'json',
      },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleClear = () => {
    onChange({
      target: {
        name,
        value: null,
        type: attribute?.type || 'json',
      },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <Field.Root
      hint={description?.defaultMessage ?? hint}
      error={error as string}
      name={name}
      required={required}
    >
      <Flex direction="column" alignItems="stretch" gap={1}>
        <Field.Label>{intlLabel?.defaultMessage ?? label}</Field.Label>
        <MultiSelect
          name={name}
          placeholder={placeholder || 'Select property components'}
          value={sanitizedValue}
          onChange={handleChange}
          withTags
          onClear={handleClear}
          clearLabel="Clear"
          disabled={disabled || loading}
        >
          {options.map((option) => (
            <MultiSelectOption key={option.value} value={option.value}>
              {option.label}
            </MultiSelectOption>
          ))}
        </MultiSelect>
        <Field.Hint />
        <Field.Error />
      </Flex>
    </Field.Root>
  );
};

export default PropertyListInput;
