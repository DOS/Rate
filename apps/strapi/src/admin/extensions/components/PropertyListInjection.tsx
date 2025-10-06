import React from 'react';
import { unstable_useContentManagerContext } from '@strapi/strapi/admin';
import PropertyListSelector from './PropertyListSelector';

const PropertyListInjection = () => {
  const ctx = unstable_useContentManagerContext();

  // Check if context is available and has form data
  if (!ctx || !ctx.form) {
    return null;
  }

  const { form, model } = ctx;
  const { values, onChange } = form;

  // Only show for Category content type
  if (model !== 'api::category.category') {
    return null;
  }

  const handleChange = (e: any) => {
    onChange({
      target: {
        name: 'PropertyList',
        value: e.target.value,
        type: 'json'
      }
    });
  };

  return (
    <PropertyListSelector
      name="PropertyList"
      value={values.PropertyList}
      onChange={handleChange}
      label="Property Components"
      hint="Select which property components to auto-generate for items in this category"
    />
  );
};

export default PropertyListInjection;
