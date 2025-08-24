import React, { useState, useEffect } from 'react';
import { 
  TextInput, 
  NumberInput, 
  Checkbox, 
  SingleSelect,
  SingleSelectOption,
  DatePicker,
  Textarea,
  Field,
  Flex,
  Box,
  Typography,
  JSONInput
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

interface FieldDefinition {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'textarea' | 'json';
  required?: boolean;
  options?: string[]; // For select type
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface DynamicFieldsEditorProps {
  categoryId?: number | string;
  value?: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

export const DynamicFieldsEditor: React.FC<DynamicFieldsEditorProps> = ({
  categoryId,
  value = {},
  onChange,
  error,
  disabled
}) => {
  const { get } = useFetchClient();
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryInfo, setCategoryInfo] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch category and its field definitions
  useEffect(() => {
    const fetchCategoryFieldDefinitions = async () => {
      if (!categoryId) {
        setFieldDefinitions([]);
        setCategoryInfo(null);
        return;
      }

      setLoading(true);
      try {
        // Fetch category details including Type and FieldDefinitions
        const response = await get(`/content-manager/collection-types/api::category.category/${categoryId}`);
        
        if (response.data) {
          setCategoryInfo({
            name: response.data.Name,
            type: response.data.Type
          });

          // Parse field definitions from JSON
          if (response.data.FieldDefinitions) {
            try {
              const definitions = typeof response.data.FieldDefinitions === 'string' 
                ? JSON.parse(response.data.FieldDefinitions)
                : response.data.FieldDefinitions;
              
              setFieldDefinitions(definitions || getDefaultFieldsForType(response.data.Type));
            } catch (e) {
              console.error('Error parsing field definitions:', e);
              // Fallback to default fields based on Type
              setFieldDefinitions(getDefaultFieldsForType(response.data.Type));
            }
          } else {
            // Use default fields based on Type
            setFieldDefinitions(getDefaultFieldsForType(response.data.Type));
          }
        }
      } catch (error) {
        console.error('Error fetching category field definitions:', error);
        setFieldDefinitions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategoryFieldDefinitions();
  }, [categoryId, get]);

  // Default field definitions based on category type
  const getDefaultFieldsForType = (type: string): FieldDefinition[] => {
    const fieldsByType: Record<string, FieldDefinition[]> = {
      'Product': [
        { name: 'brand', label: 'Brand', type: 'text' },
        { name: 'model', label: 'Model', type: 'text' },
        { name: 'sku', label: 'SKU', type: 'text' },
        { name: 'price', label: 'Price', type: 'number' },
        { name: 'inStock', label: 'In Stock', type: 'boolean' },
        { name: 'specifications', label: 'Technical Specifications', type: 'json' }
      ],
      'Person': [
        { name: 'firstName', label: 'First Name', type: 'text', required: true },
        { name: 'lastName', label: 'Last Name', type: 'text', required: true },
        { name: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
        { name: 'profession', label: 'Profession', type: 'text' },
        { name: 'biography', label: 'Biography', type: 'textarea' }
      ],
      'Business': [
        { name: 'companyName', label: 'Company Name', type: 'text', required: true },
        { name: 'businessId', label: 'Business ID', type: 'text' },
        { name: 'taxId', label: 'Tax ID', type: 'text' },
        { name: 'industry', label: 'Industry', type: 'text' },
        { name: 'yearEstablished', label: 'Year Established', type: 'number' },
        { name: 'numberOfEmployees', label: 'Number of Employees', type: 'number' }
      ],
      'Service': [
        { name: 'serviceName', label: 'Service Name', type: 'text', required: true },
        { name: 'serviceType', label: 'Service Type', type: 'text' },
        { name: 'pricing', label: 'Pricing', type: 'json' },
        { name: 'availability', label: 'Availability', type: 'json' }
      ]
    };

    return fieldsByType[type] || [];
  };

  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    const newValue = {
      ...value,
      [fieldName]: fieldValue
    };
    onChange(newValue);
  };

  const renderField = (field: FieldDefinition) => {
    const fieldValue = value?.[field.name] || '';
    const fieldError = errors[field.name];

    switch (field.type) {
      case 'text':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <TextInput
              value={fieldValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                handleFieldChange(field.name, e.target.value)
              }
              disabled={disabled}
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      case 'number':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <NumberInput
              value={fieldValue}
              onValueChange={(value: number) => 
                handleFieldChange(field.name, value)
              }
              disabled={disabled}
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      case 'boolean':
        return (
          <Checkbox
            name={field.name}
            value={fieldValue}
            onValueChange={(value: boolean) => 
              handleFieldChange(field.name, value)
            }
            disabled={disabled}
          >
            {field.label}
          </Checkbox>
        );

      case 'textarea':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <Textarea
              value={fieldValue}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                handleFieldChange(field.name, e.target.value)
              }
              disabled={disabled}
              placeholder={`Enter ${field.label.toLowerCase()}`}
            />
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      case 'json':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <JSONInput
              value={fieldValue}
              onChange={(value: any) => 
                handleFieldChange(field.name, value)
              }
              disabled={disabled}
            />
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      case 'select':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <SingleSelect
              value={fieldValue}
              onChange={(value: string) => 
                handleFieldChange(field.name, value)
              }
              disabled={disabled}
              placeholder={`Select ${field.label.toLowerCase()}`}
            >
              <SingleSelectOption value="">Select {field.label}</SingleSelectOption>
              {field.options?.map(option => (
                <SingleSelectOption key={option} value={option}>
                  {option}
                </SingleSelectOption>
              ))}
            </SingleSelect>
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      case 'date':
        return (
          <Field.Root 
            name={field.name} 
            error={fieldError}
            required={field.required}
          >
            <Field.Label>{field.label}</Field.Label>
            <DatePicker
              value={fieldValue}
              onChange={(date: Date) => 
                handleFieldChange(field.name, date)
              }
              disabled={disabled}
            />
            {fieldError && <Field.Error />}
          </Field.Root>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return <Box padding={4}>Loading category fields...</Box>;
  }

  if (!categoryId) {
    return (
      <Box padding={4} background="neutral100">
        <Typography variant="pi">
          Please select a category first to see available fields.
        </Typography>
      </Box>
    );
  }

  if (fieldDefinitions.length === 0) {
    return (
      <Box padding={4} background="neutral100">
        <Typography variant="pi">
          No custom fields defined for this category.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {categoryInfo && (
        <Box paddingBottom={4}>
          <Typography variant="beta">
            {categoryInfo.name} Fields
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            Category Type: {categoryInfo.type}
          </Typography>
        </Box>
      )}
      
      <Flex direction="column" gap={4}>
        {fieldDefinitions.map((field) => (
          <Box key={field.name}>
            {renderField(field)}
          </Box>
        ))}
      </Flex>
    </Box>
  );
};

export default DynamicFieldsEditor; 