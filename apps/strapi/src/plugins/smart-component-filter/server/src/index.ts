'use strict';

module.exports = {
  register({ strapi }) {
    console.log('🎯 [Smart Component Filter] Server registration started');
    
    // Register component-multi-select custom field
    strapi.customFields.register({
      name: 'component-multi-select',
      plugin: 'smart-component-filter',
      type: 'string',
    });
    
    // Register dynamic-category-enum custom field  
    strapi.customFields.register({
      name: 'dynamic-category-enum',
      plugin: 'smart-component-filter',
      type: 'enumeration',
      inputSize: {
        default: 4,
        isResizable: true,
      },
    });
    
    console.log('✅ [Smart Component Filter] Server custom fields registered successfully');
  },

  bootstrap({ strapi }) {
    console.log('🚀 [Smart Component Filter] Server bootstrap completed');
  },
}; 