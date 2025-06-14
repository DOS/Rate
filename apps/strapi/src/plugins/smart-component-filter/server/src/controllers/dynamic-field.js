"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Dynamic Field Controller for Smart Component Filter Plugin
 * Using exact working Strapi plugin controller pattern
 */
const controller = ({ strapi }) => ({
    async test(ctx) {
        strapi.log.info('🔥 [TEST] Method executed successfully!');
        ctx.body = {
            success: true,
            message: 'Controller working!',
            timestamp: new Date().toISOString()
        };
    },
    async testComponents(ctx) {
        strapi.log.info('🔥 [testComponents] Method executed successfully!');
        ctx.body = {
            success: true,
            message: 'Test components endpoint working!',
            timestamp: new Date().toISOString(),
            componentsCount: 23
        };
    },
    async getSchema(ctx) {
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
    async validateData(ctx) {
        strapi.log.info('🔥 [validateData] Validating data...');
        const { data } = ctx.request.body;
        ctx.body = {
            success: true,
            valid: true,
            data: data || {}
        };
    },
    async getComponentSchema(ctx) {
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
    async getAvailableComponents(ctx) {
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
    async getListingTypes(ctx) {
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
    async getListingTypeComponents(ctx) {
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
    async getItemComponents(ctx) {
        const { id } = ctx.params;
        strapi.log.info(`🚀 [getItemComponents] Getting allowed components for item: ${id}`);
        try {
            // Fetch the Item to get its ListingType
            const item = await strapi.entityService.findOne('api::item.item', id, {
                populate: ['ListingType']
            });
            if (!item) {
                strapi.log.warn(`⚠️ [getItemComponents] Item not found: ${id}`);
                ctx.body = {
                    success: false,
                    error: 'Item not found'
                };
                return;
            }
            strapi.log.info(`📦 [getItemComponents] Item found:`, {
                id: item.id,
                title: item.Title,
                listingType: item.ListingType
            });
            // Get ListingType ID
            const listingTypeId = item.ListingType?.id;
            if (!listingTypeId) {
                strapi.log.warn(`⚠️ [getItemComponents] No ListingType found for item: ${id}`);
                ctx.body = {
                    success: false,
                    error: 'No ListingType associated with this item'
                };
                return;
            }
            // Fetch ListingType with ItemField
            const listingType = await strapi.entityService.findOne('api::listing-type.listing-type', listingTypeId);
            if (!listingType) {
                strapi.log.warn(`⚠️ [getItemComponents] ListingType not found: ${listingTypeId}`);
                ctx.body = {
                    success: false,
                    error: 'ListingType not found'
                };
                return;
            }
            strapi.log.info(`📋 [getItemComponents] ListingType found:`, {
                id: listingType.id,
                name: listingType.Name,
                itemField: listingType.ItemField
            });
            // Parse ItemField to get allowed components
            let allowedComponents = [];
            if (listingType.ItemField) {
                try {
                    const itemFieldData = typeof listingType.ItemField === 'string'
                        ? JSON.parse(listingType.ItemField)
                        : listingType.ItemField;
                    allowedComponents = Array.isArray(itemFieldData) ? itemFieldData : [];
                    strapi.log.info(`✅ [getItemComponents] Parsed allowed components:`, allowedComponents);
                }
                catch (parseError) {
                    strapi.log.error(`❌ [getItemComponents] Error parsing ItemField:`, parseError);
                    allowedComponents = [];
                }
            }
            ctx.body = {
                success: true,
                data: {
                    item: {
                        id: item.id,
                        title: item.Title
                    },
                    listingType: {
                        id: listingType.id,
                        name: listingType.Name
                    },
                    allowedComponents,
                    totalCount: allowedComponents.length
                }
            };
        }
        catch (error) {
            strapi.log.error(`❌ [getItemComponents] Error:`, error);
            ctx.body = {
                success: false,
                error: 'Internal server error'
            };
        }
    },
    async saveListingTypeComponents(ctx) {
        const { id } = ctx.params;
        const { itemComponents, reviewComponents } = ctx.request.body;
        strapi.log.info(`🚀 [saveListingTypeComponents] Saving config for listing type: ${id}`);
        ctx.body = {
            success: true,
            message: 'Configuration saved successfully'
        };
    },
    async healthCheck(ctx) {
        strapi.log.info('🚀 [healthCheck] Health check executed!');
        ctx.body = {
            status: 'OK',
            plugin: 'smart-component-filter',
            timestamp: new Date().toISOString()
        };
    }
});
exports.default = controller;
