"use strict";
/**
 * page controller
 */
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
const breadcrumbs_1 = require("../../../utils/breadcrumbs");
exports.default = strapi_1.factories.createCoreController("api::page.page", ({ strapi }) => ({
    async find(ctx) {
        const { data, meta } = await super.find(ctx);
        const fullPath = (0, breadcrumbs_1.getFullPathFromQuery)(ctx);
        if (fullPath && data && data.length === 1) {
            // Create breadcrumbs only when a specific page is requested to avoid unnecessary processing
            meta.breadcrumbs = await (0, breadcrumbs_1.generateBreadcrumbs)(data[0], "api::page.page");
        }
        return { data, meta };
    },
}));
