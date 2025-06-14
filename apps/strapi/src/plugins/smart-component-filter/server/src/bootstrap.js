"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ({ strapi }) => {
    // Server bootstrap - no custom field registration here
    // Custom fields are registered in admin/src/index.tsx
    strapi.log.info('[Smart Component Filter] Server bootstrap completed');
};
