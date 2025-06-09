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
}: ComponentMultiSelectInputProps) => {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fieldDisplayName, setFieldDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        const { get } = getFetchClient();
        
        // Fetch components
        const response = await get('/api/smart-component-filter/components');
        
        // Try to fetch field display name from content type schema if contentTypeUID is available
        if (contentTypeUID) {
          try {
            // Look in contentType.attributes for field configuration
            if (response.data?.contentType?.attributes?.[name]) {
              const fieldConfig = response.data.contentType.attributes[name];
              
              // Look for display name in various places
              const displayName = fieldConfig.customField?.displayName || 
                                fieldConfig.customField?.name ||
                                fieldConfig.displayName ||
                                fieldConfig.name;
              
              if (displayName) {
                setFieldDisplayName(displayName);
              }
            }
            
            // Also try layouts.edit for field metadata
            if (response.data?.layouts?.edit) {
              const editLayouts = response.data.layouts.edit;
              
              // Flatten all fields from all sections
              const allFields = editLayouts.flatMap((section: any) => section.children?.flatMap((row: any) => row) || []);
              const fieldMeta = allFields.find((field: any) => field.name === name);
              
              if (fieldMeta) {
                const displayName = fieldMeta.label || fieldMeta.displayName || fieldMeta.name;
                if (displayName) {
                  setFieldDisplayName(displayName);
                }
              }
            }
          } catch (schemaError) {
            // Schema fetch failed, continue without field name
          }
        }
        
        // Check if response.data.data.components exists (nested structure)
        const componentsData = response.data?.data?.components || response.data?.components;
        
        if (componentsData && Array.isArray(componentsData)) {
          setComponents(componentsData);
        } else {
          setComponents([]);
        }
      } catch (error) {
        setFetchError('Failed to load components');
        setComponents([]);
      }
      
      setLoading(false);
    };

    fetchData();
  }, [contentTypeUID, name]);

  const handleChange = (selectedValues: string[]) => {
    onChange({
      target: {
        name,
        value: selectedValues
      }
    });
  };

  // Try to get field name from various sources
  const getFieldLabel = () => {
    // 1. Ưu tiên label do user đặt khi add field (chuẩn Strapi)
    if (metadatas?.label) return metadatas.label;
    // 2. Fallback: dùng intlLabel nếu có
    if (intlLabel?.defaultMessage) return intlLabel.defaultMessage;
    // 3. Fallback cuối cùng: dùng tên field
    if (name) return name;
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

  // Define categories to hide for Smart Component Filter
  const hiddenCategories = [
    'elements',
    'sections', 
    'seo-utilities',
    'utilities',
    'shared',
    'forms'
  ];

  // Filter out hidden categories and sort remaining categories alphabetically
  const sortedCategories = Object.keys(groupedComponents)
    .filter(category => !hiddenCategories.includes(category.toLowerCase()))
    .sort();
    
  sortedCategories.forEach(category => {
    groupedComponents[category].sort((a, b) => a.displayName.localeCompare(b.displayName));
  });

  return (
    <>
      <style>{`
        /* Hide ALL checkboxes and styling for category headers */
        [role="option"][aria-disabled="true"] input[type="checkbox"],
        [role="option"][aria-disabled="true"] [role="checkbox"] {
          display: none !important;
        }
        [role="option"][aria-disabled="true"] {
          padding-left: 12px !important;
          pointer-events: none;
        }
        [role="option"][aria-disabled="true"] * {
          pointer-events: none;
        }
        /* Force override chiều cao dropdown MultiSelect của Strapi */
        .c-multi-select__popover {
          max-height: 420px !important;
          min-height: 200px;
          overflow-y: auto !important;
        }
      `}</style>
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
              {/* Category header WITHOUT checkbox */}
              <MultiSelectOption 
                key={`category-${category}`} 
                value={`__category__${category}`}
                disabled
              >
                <strong style={{ 
                  fontSize: '11px', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.5px'
                }}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </strong>
              </MultiSelectOption>
              {/* Components with checkboxes */}
              {groupedComponents[category].map((component) => (
                <MultiSelectOption 
                  key={component.uid} 
                  value={component.uid}
                  style={{ paddingLeft: '24px' }}
                >
                  {component.displayName}
                </MultiSelectOption>
              ))}
            </Fragment>
          ))}
        </MultiSelect>
        {error && <Field.Error>{error}</Field.Error>}
        <Field.Hint>
          Smart Component Filter v2.1.0 - Filtered categories (hiding Elements, Sections, SEO-utilities, Utilities, Shared, Forms)
        </Field.Hint>
      </Field.Root>
    </>
  );
};

export default ComponentMultiSelectInput; 