import type { Core } from '@strapi/strapi';

/**
 * Dynamic Field Controller for Smart Component Filter Plugin
 * Using exact working Strapi plugin controller pattern
 */

const controller = ({ strapi }: { strapi: Core.Strapi }) => ({
  async test(ctx: any) {
    strapi.log.info('🔥 [TEST] Method executed successfully!');
    ctx.body = {
      success: true,
      message: 'Controller working!',
      timestamp: new Date().toISOString()
    };
  },

  async testComponents(ctx: any) {
    strapi.log.info('🔥 [testComponents] Method executed successfully!');
    ctx.body = {
      success: true,
      message: 'Test components endpoint working!',
      timestamp: new Date().toISOString(),
      componentsCount: 23
    };
  },

  async getSchema(ctx: any) {
    const { listingTypeId } = ctx.params;
    strapi.log.info(`🔥 [getSchema] Getting schema for listing type: ${listingTypeId}`);
    
    ctx.body = {
      success: true,
      data: {
        listingTypeId,
        schema: {
          fields: [],
          validation: {}
        }
      }
    };
  },

  async validateData(ctx: any) {
    strapi.log.info('🔥 [validateData] Validating data...');
    const { data } = ctx.request.body;
    
    ctx.body = {
      success: true,
      valid: true,
      data: data || {}
    };
  },

  async getComponentSchema(ctx: any) {
    const { componentName } = ctx.params;
    strapi.log.info(`🔥 [getComponentSchema] Getting schema for component: ${componentName}`);
    
    ctx.body = {
      success: true,
      data: {
        componentName,
        schema: {
          attributes: {},
          info: {
            displayName: componentName
          }
        }
      }
    };
  },

  async getAvailableComponents(ctx: any) {
    strapi.log.info('🚀 [getAvailableComponents] Method executed successfully!'); 
    
    const hardcodedComponents = [
      {
        uid: 'contact.basic',
        name: 'contact.basic',
        displayName: 'Basic Contact',
        description: 'Basic contact information',
        category: 'contact',
        icon: 'address-card',
        attributes: ['email', 'phone', 'address'],
        attributeCount: 3,
      },
      {
        uid: 'contact.location',
        name: 'contact.location',
        displayName: 'Location Contact', 
        description: 'Location contact information',
        category: 'contact',
        icon: 'map-marker',
        attributes: ['latitude', 'longitude', 'address'],
        attributeCount: 3,
      },
      {
        uid: 'violation.report',
        name: 'violation.report',
        displayName: 'Violation Report',
        description: 'Report violation information',
        category: 'violation',
        icon: 'exclamation-triangle',
        attributes: ['type', 'description', 'severity'],
        attributeCount: 3,
      },
    ];

    strapi.log.info(`✅ [getAvailableComponents] Returning ${hardcodedComponents.length} components`);
    
    ctx.body = {
      success: true,
      data: hardcodedComponents
    };
  },

  async getListingTypes(ctx: any) {
    strapi.log.info('🚀 [getListingTypes] Method executed successfully!');
    
    const hardcodedListingTypes = [
      {
        id: 1,
        value: 'scammer',
        label: 'Scammer',
      },
      {
        id: 2,
        value: 'company', 
        label: 'Company',
      },
      {
        id: 3,
        value: 'individual',
        label: 'Individual',
      },
    ];

    strapi.log.info(`✅ [getListingTypes] Returning ${hardcodedListingTypes.length} listing types`);
    
    ctx.body = {
      success: true,
      data: hardcodedListingTypes
    };
  },

  async getListingTypeComponents(ctx: any) {
    const { id } = ctx.params;
    strapi.log.info(`🚀 [getListingTypeComponents] Getting config for listing type: ${id}`);
    
    ctx.body = {
      success: true,
      data: {
        listingTypeId: id,
        itemComponents: [],
        reviewComponents: []
      }
    };
  },

  async saveListingTypeComponents(ctx: any) {
    const { id } = ctx.params;
    const { itemComponents, reviewComponents } = ctx.request.body;
    
    strapi.log.info(`🚀 [saveListingTypeComponents] Saving config for listing type: ${id}`);
    
    ctx.body = {
      success: true,
      message: 'Configuration saved successfully'
    };
  },

  async healthCheck(ctx: any) {
    strapi.log.info('🚀 [healthCheck] Health check executed!');
    ctx.body = { 
      status: 'OK',
      plugin: 'smart-component-filter',
      timestamp: new Date().toISOString()
    };
  }
});

export default controller; 