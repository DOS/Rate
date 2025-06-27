import React, { useState, useEffect } from 'react';
import { 
  TextInput, 
  NumberInput, 
  Checkbox, 
  Select, 
  Option,
  DatePicker,
  Textarea,
  Field,
  Flex,
  Box
} from '@strapi/design-system';

interface FieldDefinition {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'textarea';
  required?: boolean;
  options?: string[]; // For select type
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface DynamicFieldsEditorProps {
  categorySlug: string;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  error?: Record<string, string>;
}

export const DynamicFieldsEditor: React.FC<DynamicFieldsEditorProps> = ({
  categorySlug,
  value = {},
  onChange,
  error = {}
}) => {
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategoryFields = async () => {
      if (!categorySlug) {
        setFieldDefinitions([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch category với field definitions
        const response = await fetch(
          `/api/categories?filters[Slug][$eq]=${categorySlug}&fields[0]=FieldDefinitions`
        );
        
        if (!response.ok) throw new Error('Failed to fetch category');
        
        const data = await response.json();
        const category = data.data?.[0];
        
        if (category?.FieldDefinitions) {
          setFieldDefinitions(category.FieldDefinitions);
        } else {
          setFieldDefinitions([]);
        }
      } catch (err) {
        console.error('Error fetching category fields:', err);
        setFieldDefinitions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryFields();
  }, [categorySlug]);

  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    onChange({
      ...value,
      [fieldName]: fieldValue
    });
  };

  const renderField = (field: FieldDefinition) => {
    const fieldValue = value[field.name] || '';
    const fieldError = error[field.name];

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            name={field.name}
            label={field.label}
            value={fieldValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
              handleFieldChange(field.name, e.target.value)
            }
            error={fieldError}
            required={field.required}
          />
        );

      case 'textarea':
        return (
          <Textarea
            name={field.name}
            label={field.label}
            value={fieldValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
              handleFieldChange(field.name, e.target.value)
            }
            error={fieldError}
            required={field.required}
          />
        );

      case 'number':
        return (
          <NumberInput
            name={field.name}
            label={field.label}
            value={fieldValue}
            onValueChange={(value: number) => 
              handleFieldChange(field.name, value)
            }
            error={fieldError}
            required={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );

      case 'boolean':
        return (
          <Checkbox
            name={field.name}
            value={fieldValue}
            onValueChange={(value: boolean) => 
              handleFieldChange(field.name, value)
            }
          >
            {field.label}
          </Checkbox>
        );

      case 'select':
        return (
          <Select
            name={field.name}
            label={field.label}
            value={fieldValue}
            onChange={(value: string) => 
              handleFieldChange(field.name, value)
            }
            error={fieldError}
            required={field.required}
          >
            <Option value="">Select {field.label}</Option>
            {field.options?.map(option => (
              <Option key={option} value={option}>
                {option}
              </Option>
            ))}
          </Select>
        );

      case 'date':
        return (
          <DatePicker
            name={field.name}
            label={field.label}
            value={fieldValue}
            onChange={(date: Date) => 
              handleFieldChange(field.name, date)
            }
            error={fieldError}
            required={field.required}
          />
        );

      default:
        return null;
    }
  };

  if (loading) {
    return <Box padding={4}>Loading category fields...</Box>;
  }

  if (!categorySlug) {
    return (
      <Box padding={4} background="neutral100">
        Please select a category first to see available fields.
      </Box>
    );
  }

  if (fieldDefinitions.length === 0) {
    return (
      <Box padding={4} background="neutral100">
        No custom fields defined for this category.
      </Box>
    );
  }

  return (
    <Flex direction="column" gap={4}>
      {fieldDefinitions.map((field) => (
        <Field key={field.name}>
          {renderField(field)}
        </Field>
      ))}
    </Flex>
  );
}; 