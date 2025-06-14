"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const register = ({ strapi }) => {
    // Register custom field on server side for Strapi v5
    strapi.customFields.register({
        name: 'component-multi-select',
        plugin: 'smart-component-filter',
        type: 'json',
    });
    console.log('✅ Smart Component Filter server registered');
    console.log('✅ Custom Field registered in server');
};
exports.default = register;
