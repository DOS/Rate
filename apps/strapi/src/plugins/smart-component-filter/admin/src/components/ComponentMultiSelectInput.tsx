import React, { useState, useEffect } from 'react';
import { MultiSelect, MultiSelectOption, Loader, Alert, Field } from '@strapi/design-system';
import { getFetchClient } from '@strapi/strapi/admin';

interface ComponentData {
  uid: string;
  displayName: string;
  category: string;
  attributes: any;
}

interface OptionType {
  label: string;
  value: string;
}

interface ComponentMultiSelectInputProps {
  attribute: {
    customField: string;
  };
  disabled?: boolean;
  intlLabel: {
    id: string;
    defaultMessage: string;
  };
  labelAction?: React.ReactNode;
  name: string;
  onChange: (event: { target: { name: string; value: any; type: string } }) => void;
  required?: boolean;
  value: string[];
}

const ComponentMultiSelectInput: React.FC<ComponentMultiSelectInputProps> = ({
  attribute,
  disabled,
  intlLabel,
  labelAction,
  name,
  onChange,
  required,
  value = []
}) => {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { get } = getFetchClient();

  useEffect(() => {
    const fetchComponents = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to fetch real components from plugin service
        try {
          const response = await get('/smart-component-filter/components');
          if (response.data?.components) {
            console.log('✅ Loaded real components:', response.data.components.length);
            setComponents(response.data.components);
            setLoading(false);
            return;
          }
        } catch (apiError) {
          console.warn('⚠️ Plugin API not available, using fallback:', apiError);
        }

        // Fallback to enhanced mock data organized by category
        console.log('📋 Using enhanced fallback component data');
        const fallbackComponents: ComponentData[] = [
          // CONTACT Components
          { uid: 'contact.basic', displayName: 'Thông Tin Cơ Bản', category: 'contact', attributes: {} },
          { uid: 'contact.location', displayName: 'Địa Chỉ', category: 'contact', attributes: {} },
          { uid: 'contact.social', displayName: 'Mạng Xã Hội', category: 'contact', attributes: {} },
          { uid: 'contact.professional', displayName: 'Thông Tin Nghề Nghiệp', category: 'contact', attributes: {} },
          
          // VIOLATION Components  
          { uid: 'violation.fraud-details', displayName: 'Chi Tiết Lừa Đảo', category: 'violation', attributes: {} },
          { uid: 'violation.evidence', displayName: 'Bằng Chứng', category: 'violation', attributes: {} },
          { uid: 'violation.timeline', displayName: 'Thời Gian Xảy Ra', category: 'violation', attributes: {} },
          { uid: 'violation.impact', displayName: 'Tác Động', category: 'violation', attributes: {} },
          
          // REVIEW Components
          { uid: 'review.rating', displayName: 'Đánh Giá Sao', category: 'review', attributes: {} },
          { uid: 'review.comment', displayName: 'Bình Luận', category: 'review', attributes: {} },
          { uid: 'review.criteria', displayName: 'Tiêu Chí Đánh Giá', category: 'review', attributes: {} },
          { uid: 'review.photos', displayName: 'Hình Ảnh Đánh Giá', category: 'review', attributes: {} },
          
          // CONTENT Components
          { uid: 'content.description', displayName: 'Mô Tả', category: 'content', attributes: {} },
          { uid: 'content.media-gallery', displayName: 'Thư Viện Ảnh', category: 'content', attributes: {} },
          { uid: 'content.documents', displayName: 'Tài Liệu', category: 'content', attributes: {} },
          { uid: 'content.features', displayName: 'Tính Năng Nổi Bật', category: 'content', attributes: {} },
          
          // BUSINESS Components
          { uid: 'business.company-info', displayName: 'Thông Tin Công Ty', category: 'business', attributes: {} },
          { uid: 'business.services', displayName: 'Dịch Vụ', category: 'business', attributes: {} },
          { uid: 'business.pricing', displayName: 'Bảng Giá', category: 'business', attributes: {} },
          { uid: 'business.certificates', displayName: 'Chứng Chỉ', category: 'business', attributes: {} },
          
          // TECHNICAL Components
          { uid: 'technical.specifications', displayName: 'Thông Số Kỹ Thuật', category: 'technical', attributes: {} },
          { uid: 'technical.performance', displayName: 'Hiệu Suất', category: 'technical', attributes: {} },
          { uid: 'technical.compatibility', displayName: 'Tương Thích', category: 'technical', attributes: {} },
        ];

        setComponents(fallbackComponents);
        setLoading(false);
        
      } catch (err) {
        console.error('❌ Error loading components:', err);
        setError('Không thể tải danh sách components');
        setLoading(false);
      }
    };

    fetchComponents();
  }, []);

  const handleChange = (selectedValues: string[]) => {
    console.log('🔄 Component selection changed:', selectedValues);
    onChange({
      target: {
        name,
        value: selectedValues,
        type: 'json'
      },
    });
  };

  // Group options by category for better UX
  const groupedOptions = components.reduce((acc, component) => {
    const category = component.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push({
      label: `${component.displayName}`,
      value: component.uid,
    });
    return acc;
  }, {} as Record<string, OptionType[]>);

  // Flatten options with category prefixes
  const options: OptionType[] = Object.entries(groupedOptions)
    .flatMap(([category, categoryOptions]) => [
      // Add category header (disabled option)
      {
        label: `── ${category.toUpperCase()} ──`,
        value: `__category_${category}`,
      },
      // Add category options with indentation
      ...categoryOptions.map(opt => ({
        ...opt,
        label: `  ${opt.label}`,
      }))
    ]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px' }}>
        <Loader small />
        <span>Đang tải components...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" title="Lỗi">
        {error}
      </Alert>
    );
  }

  return (
    <Field.Root name={name} id={name} error={error} required={required}>
      <Field.Label action={labelAction}>
        {intlLabel?.defaultMessage || name}
      </Field.Label>
      <MultiSelect
        name={name}
        placeholder="Chọn components cho listing type này..."
        value={value || []}
        onChange={handleChange}
        disabled={disabled}
      >
        {options.map(option => (
          <MultiSelectOption 
            key={option.value} 
            value={option.value}
            disabled={option.value.startsWith('__category_')}
            style={{
              fontWeight: option.value.startsWith('__category_') ? 'bold' : 'normal',
              color: option.value.startsWith('__category_') ? '#666' : 'inherit',
              fontSize: option.value.startsWith('__category_') ? '12px' : '14px',
            }}
          >
            {option.label}
          </MultiSelectOption>
        ))}
      </MultiSelect>
      <Field.Hint>
        Đã chọn {(value || []).length} components từ {components.length} components có sẵn
      </Field.Hint>
      <Field.Error />
    </Field.Root>
  );
};

export default ComponentMultiSelectInput; 