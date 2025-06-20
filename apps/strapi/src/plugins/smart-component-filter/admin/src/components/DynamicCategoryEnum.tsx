import React, { useState, useEffect } from 'react';
import { SingleSelect, SingleSelectOption, Field } from '@strapi/design-system';

interface Category {
  id: number;
  documentId: string;
  Name: string;
  Slug: string;
  isActive: boolean;
}

interface DynamicCategoryEnumProps {
  name: string;
  value?: string;
  onChange: (event: { target: { name: string; value: string; type: string } }) => void;
  error?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  label?: string;
}

export const DynamicCategoryEnum: React.FC<DynamicCategoryEnumProps> = ({
  name,
  value = '',
  onChange,
  error,
  description,
  disabled = false,
  required = false,
  placeholder = 'Select a category...',
  label = 'Category'
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        console.log('🔍 [Dynamic Category Enum] Fetching categories...');
        
        // Fetch categories từ Strapi API
        const response = await fetch('/api/categories?fields[0]=Name&fields[1]=Slug&fields[2]=isActive&filters[isActive][$eq]=true&sort[0]=Name:asc');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ [Dynamic Category Enum] Categories fetched:', data.data?.length || 0);
        
        if (data.data && Array.isArray(data.data)) {
          setCategories(data.data);
          setApiError(null);
        } else {
          console.warn('⚠️ [Dynamic Category Enum] Invalid response format:', data);
          setApiError('Invalid response format');
        }
      } catch (error) {
        console.error('❌ [Dynamic Category Enum] Error fetching categories:', error);
        setApiError(error instanceof Error ? error.message : 'Unknown error');
        
        // Fallback data for testing
        setCategories([
          { id: 1, documentId: 'test1', Name: 'Bank', Slug: 'bank', isActive: true },
          { id: 2, documentId: 'test2', Name: 'Scammer', Slug: 'scammer', isActive: true },
          { id: 3, documentId: 'test3', Name: 'Restaurant', Slug: 'restaurant', isActive: true },
          { id: 4, documentId: 'test4', Name: 'Hotel', Slug: 'hotel', isActive: true }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  const handleChange = (selectedValue: string) => {
    console.log('🎯 [Dynamic Category Enum] Value changed:', selectedValue);
    
    onChange({
      target: {
        name,
        value: selectedValue,
        type: 'dynamic-category-enum'
      }
    });
  };

  if (loading) {
    return (
      <Field.Root name={name} error={error} hint={description} required={required}>
        <Field.Label>{label}</Field.Label>
        <SingleSelect 
          placeholder="Loading categories..." 
          disabled={true}
          value=""
          onChange={() => {}}
        >
          <SingleSelectOption value="">Loading...</SingleSelectOption>
        </SingleSelect>
        {error && <Field.Error />}
        {description && <Field.Hint />}
      </Field.Root>
    );
  }

  return (
    <Field.Root name={name} error={error} hint={description} required={required}>
      <Field.Label>{label}</Field.Label>
      <SingleSelect
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        error={error}
      >
        {categories.length === 0 ? (
          <SingleSelectOption value="">
            {apiError ? `Error: ${apiError}` : 'No categories available'}
          </SingleSelectOption>
        ) : (
          categories.map((category) => (
            <SingleSelectOption key={category.documentId} value={category.Slug}>
              {category.Name}
            </SingleSelectOption>
          ))
        )}
      </SingleSelect>
      {error && <Field.Error />}
      {description && <Field.Hint />}
      {apiError && (
        <div style={{ color: '#d02b20', fontSize: '12px', marginTop: '4px' }}>
          API Error: {apiError} (Using fallback data)
        </div>
      )}
    </Field.Root>
  );
};

export default DynamicCategoryEnum; 