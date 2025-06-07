import React from 'react';
import { TextInput, Field } from '@strapi/design-system';

interface SimpleInputProps {
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
  value: string;
}

const SimpleInput: React.FC<SimpleInputProps> = ({
  attribute,
  disabled,
  intlLabel,
  labelAction,
  name,
  onChange,
  required,
  value = ''
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      target: {
        name,
        value: e.target.value,
        type: 'text'
      },
    });
  };

  return (
    <Field.Root name={name} id={name} required={required}>
      <Field.Label action={labelAction}>
        {intlLabel?.defaultMessage || name}
      </Field.Label>
      <TextInput
        name={name}
        placeholder="Enter component list..."
        value={value || ''}
        onChange={handleChange}
        disabled={disabled}
      />
    </Field.Root>
  );
};

export default SimpleInput; 