import type { Core } from '@strapi/strapi';

export interface ComponentSchema {
  name: string;
  displayName: string;
  description?: string;
  attributes: Record<string, any>;
}

export interface FieldGroupSchema {
  components: string[];
  schemas: Record<string, ComponentSchema>;
}

/**
 * Schema Loader Service
 * Load và parse schema từ Listing Type field_group
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Load field_group schema từ Listing Type
   */
  async loadSchemaFromListingType(listingTypeId: number): Promise<FieldGroupSchema | null> {
    try {
      // Load Listing Type với populate field_group
      const listingType = await strapi.entityService.findOne(
        'api::listing-type.listing-type',
        listingTypeId,
        {
          populate: {
            FieldGroup: true,
          },
        }
      );

      if (!listingType?.FieldGroup) {
        strapi.log.warn(`[Schema Loader] No FieldGroup found for Listing Type ID: ${listingTypeId}`);
        return null;
      }

      const fieldGroup = listingType.FieldGroup;
      
      // Parse components từ field_group
      const componentNames = this.extractComponentNames(fieldGroup);
      
      // Load schemas cho từng component
      const schemas = await this.loadComponentSchemas(componentNames);

      return {
        components: componentNames,
        schemas,
      };
    } catch (error) {
      strapi.log.error('[Schema Loader] Error loading schema:', error);
      return null;
    }
  },

  /**
   * Extract component names từ field_group data
   */
  extractComponentNames(fieldGroup: any): string[] {
    if (!fieldGroup) return [];

    // Field group có thể là dynamic zone với components array
    if (Array.isArray(fieldGroup.components)) {
      return fieldGroup.components;
    }

    // Hoặc có thể có structure khác tùy theo implementation
    if (fieldGroup.__component && fieldGroup.components) {
      return fieldGroup.components;
    }

    // Fallback: tìm trong data structure
    const components: string[] = [];
    
    if (typeof fieldGroup === 'object') {
      Object.values(fieldGroup).forEach((value: any) => {
        if (Array.isArray(value)) {
          value.forEach((item: any) => {
            if (item.__component) {
              components.push(item.__component);
            }
          });
        } else if (value?.__component) {
          components.push(value.__component);
        }
      });
    }

    return [...new Set(components)]; // Remove duplicates
  },

  /**
   * Load schemas cho từng component từ Strapi registry
   */
  async loadComponentSchemas(componentNames: string[]): Promise<Record<string, ComponentSchema>> {
    const schemas: Record<string, ComponentSchema> = {};

    for (const componentName of componentNames) {
      try {
        // Get component schema từ Strapi component registry
        const componentSchema = strapi.components[componentName];
        
        if (componentSchema) {
          schemas[componentName] = {
            name: componentName,
            displayName: componentSchema.info?.displayName || componentName,
            description: componentSchema.info?.description,
            attributes: componentSchema.attributes || {},
          };
        } else {
          strapi.log.warn(`[Schema Loader] Component schema not found: ${componentName}`);
        }
      } catch (error) {
        strapi.log.error(`[Schema Loader] Error loading component ${componentName}:`, error);
      }
    }

    return schemas;
  },

  /**
   * Validate data against loaded schema
   */
  async validateFieldData(data: any, schema: FieldGroupSchema): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!data || !schema) {
      errors.push('Invalid data or schema');
      return { isValid: false, errors };
    }

    // Basic validation - có thể extend thêm
    try {
      // Validate từng component data
      for (const [componentName, componentData] of Object.entries(data)) {
        const componentSchema = schema.schemas[componentName];
        
        if (!componentSchema) {
          errors.push(`Unknown component: ${componentName}`);
          continue;
        }

        // Validate component attributes
        const attributeErrors = this.validateComponentAttributes(
          componentData, 
          componentSchema.attributes
        );
        errors.push(...attributeErrors);
      }
    } catch (error) {
      errors.push(`Validation error: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validate component attributes
   */
  validateComponentAttributes(data: any, attributes: Record<string, any>): string[] {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      return ['Component data must be an object'];
    }

    // Basic attribute validation
    for (const [attrName, attrConfig] of Object.entries(attributes)) {
      const value = data[attrName];

      // Required field check
      if (attrConfig.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field '${attrName}' is required`);
      }

      // Type validation (basic)
      if (value !== undefined && value !== null) {
        switch (attrConfig.type) {
          case 'string':
          case 'text':
          case 'richtext':
            if (typeof value !== 'string') {
              errors.push(`Field '${attrName}' must be a string`);
            }
            break;
          case 'integer':
          case 'biginteger':
            if (!Number.isInteger(value)) {
              errors.push(`Field '${attrName}' must be an integer`);
            }
            break;
          case 'decimal':
          case 'float':
            if (typeof value !== 'number') {
              errors.push(`Field '${attrName}' must be a number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Field '${attrName}' must be a boolean`);
            }
            break;
          case 'email':
            if (typeof value === 'string' && !this.isValidEmail(value)) {
              errors.push(`Field '${attrName}' must be a valid email`);
            }
            break;
        }
      }
    }

    return errors;
  },

  /**
   * Email validation helper
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Get available components cho một category
   */
  async getAvailableComponents(categoryId?: number): Promise<any> {
    try {
      console.log('🔍 [Service] getAvailableComponents starting, categoryId:', categoryId);
      
      // Load all components có thể sử dụng
      const componentNames = Object.keys(strapi.components);
      console.log('🔍 [Service] Total component names found:', componentNames.length);
      console.log('🔍 [Service] First few component names:', componentNames.slice(0, 5));
      
      const components = componentNames.map((componentName) => {
        const componentSchema = strapi.components[componentName];
        
        return {
          uid: componentName,
          name: componentName,
          displayName: componentSchema.info?.displayName || componentName,
          description: componentSchema.info?.description,
          category: componentSchema.category || 'uncategorized',
          icon: componentSchema.info?.icon,
          attributes: Object.keys(componentSchema.attributes || {}),
          attributeCount: Object.keys(componentSchema.attributes || {}).length,
        };
      });
      
      console.log('🔍 [Service] Mapped components:', components.length);
      console.log('🔍 [Service] First mapped component:', components[0]);
      
      // Filter by category if specified
      let filteredComponents = components;
      if (categoryId) {
        console.log('🔍 [Service] Filtering by categoryId:', categoryId);
        // Add category filtering logic here if needed
      }
      
      console.log('✅ [Service] Returning', filteredComponents.length, 'components');
      return filteredComponents;
    } catch (error) {
      console.error('❌ [Service] getAvailableComponents error:', error);
      strapi.log.error('[Schema Loader Service] Error getting available components:', error);
      throw error;
    }
  },
}); 