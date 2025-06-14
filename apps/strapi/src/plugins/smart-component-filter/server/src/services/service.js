"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const service = ({ strapi }) => ({
    getWelcomeMessage() {
        return 'Welcome to Strapi 🚀';
    },
    // Get allowed components for a specific ListingType
    async getAllowedComponents(listingTypeId) {
        try {
            // Convert to number if it's a string
            const id = typeof listingTypeId === 'string' ? parseInt(listingTypeId, 10) : listingTypeId;
            if (isNaN(id)) {
                strapi.log.warn(`Invalid ListingType ID: ${listingTypeId}`);
                return {
                    listingType: null,
                    allowedComponents: [],
                    totalCount: 0,
                    error: `Invalid ListingType ID: ${listingTypeId}`
                };
            }
            strapi.log.info(`🔍 Looking for ListingType with ID: ${id}`);
            // First, let's check if the ListingType exists
            const listingType = await strapi.entityService.findOne('api::listing-type.listing-type', id, {
                fields: ['ItemField', 'Name'],
                populate: {}
            });
            if (!listingType) {
                strapi.log.warn(`❌ ListingType with ID ${id} not found`);
                // Let's get all available ListingTypes for debugging
                const allListingTypes = await strapi.entityService.findMany('api::listing-type.listing-type', {
                    fields: ['id', 'Name'],
                    pagination: { limit: 10 }
                });
                strapi.log.info(`📋 Available ListingTypes:`, allListingTypes);
                return {
                    listingType: null,
                    allowedComponents: [],
                    totalCount: 0,
                    error: `ListingType with ID ${id} not found`,
                    availableListingTypes: allListingTypes
                };
            }
            strapi.log.info(`✅ Found ListingType: ${listingType.Name} (ID: ${id})`);
            // Get allowed components from ItemField custom field
            // ItemField is our custom field that stores selected component UIDs
            strapi.log.info(`🔍 Raw ItemField data:`, listingType.ItemField);
            strapi.log.info(`🔍 ItemField type:`, typeof listingType.ItemField);
            let allowedComponentUIDs = [];
            // Handle different possible formats of ItemField data
            if (Array.isArray(listingType.ItemField)) {
                allowedComponentUIDs = listingType.ItemField.filter(Boolean);
            }
            else if (typeof listingType.ItemField === 'string') {
                try {
                    // Try to parse as JSON if it's a string
                    allowedComponentUIDs = JSON.parse(listingType.ItemField);
                    if (!Array.isArray(allowedComponentUIDs)) {
                        allowedComponentUIDs = [listingType.ItemField];
                    }
                }
                catch (e) {
                    // If not JSON, treat as single value or comma-separated
                    allowedComponentUIDs = listingType.ItemField.split(',').map(s => s.trim()).filter(Boolean);
                }
            }
            else if (listingType.ItemField) {
                // If it's some other truthy value, convert to array
                allowedComponentUIDs = [listingType.ItemField];
            }
            strapi.log.info(`🎯 Processed allowed components for ${listingType.Name}:`, allowedComponentUIDs);
            return {
                listingType: {
                    id: id,
                    name: listingType.Name || `ListingType ${id}`
                },
                allowedComponents: allowedComponentUIDs,
                totalCount: allowedComponentUIDs.length
            };
        }
        catch (error) {
            strapi.log.error('Error in getAllowedComponents service:', error);
            return {
                listingType: null,
                allowedComponents: [],
                totalCount: 0,
                error: error.message
            };
        }
    },
    // Get all available components in the system
    async getAvailableComponents() {
        try {
            // Get all components from Strapi's component registry
            const components = strapi.components;
            const componentList = [];
            // Convert components object to array with metadata
            for (const [uid, component] of Object.entries(components)) {
                // Extract category from component uid (e.g., 'contact.basic' -> 'contact')
                const category = uid.includes('.') ? uid.split('.')[0] : 'uncategorized';
                componentList.push({
                    uid,
                    displayName: component.info?.displayName || uid,
                    category,
                    icon: component.info?.icon || 'cube',
                    attributes: Object.keys(component.attributes || {})
                });
            }
            return {
                components: componentList,
                totalCount: componentList.length,
                categories: [...new Set(componentList.map(c => c.category))]
            };
        }
        catch (error) {
            strapi.log.error('Error getting available components:', error);
            throw error;
        }
    },
    // Helper: Validate if component UID exists
    async validateComponentUID(componentUID) {
        const components = strapi.components;
        return components.hasOwnProperty(componentUID);
    }
});
exports.default = service;
