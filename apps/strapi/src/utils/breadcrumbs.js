"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFullPathFromQuery = exports.generateBreadcrumbs = void 0;
const shared_data_1 = require("@repo/shared-data");
const generateBreadcrumbs = async (document, type) => {
    if (!document?.fullPath) {
        return [];
    }
    // Get all parents based on the fullPath
    const allSegments = document.fullPath.split("/").filter(Boolean);
    // Ensure the first segment is the root page path
    allSegments.unshift(shared_data_1.ROOT_PAGE_PATH);
    // Remove the last segment to get the parent segments
    const parents = allSegments.slice(0, -1);
    const populate = {};
    let currentPopulate = populate;
    parents.forEach((_, index) => {
        if (index === parents.length - 1) {
            // If it's the last parent, assign `true` to indicate the deepest level
            currentPopulate.parent = true;
        }
        else {
            // Otherwise, keep nesting
            currentPopulate.parent = { populate: {} };
            // Move deeper into the next level
            currentPopulate = currentPopulate.parent.populate;
        }
    });
    // Create Breadcrumbs data based on parents
    const breadcrumbs = [
        {
            title: document.breadcrumbTitle ?? document.title,
            fullPath: document.fullPath,
        },
    ];
    let hierarchy = await strapi.documents(type).findOne({
        documentId: document.documentId,
        populate,
        fields: ["breadcrumbTitle", "title", "fullPath"],
        locale: document.locale,
    });
    while (true) {
        // Pages have a `parent` field that points to the parent
        const parent = hierarchy?.parent ?? null;
        if (!parent) {
            break;
        }
        breadcrumbs.unshift({
            title: parent.breadcrumbTitle ?? parent.title,
            fullPath: parent.fullPath,
        });
        hierarchy = parent;
    }
    return breadcrumbs;
};
exports.generateBreadcrumbs = generateBreadcrumbs;
const getFullPathFromQuery = (ctx) => {
    const query = ctx.request.query;
    const fullPathFilter = query?.filters?.fullPath;
    const fullPath = fullPathFilter ? fullPathFilter["$eq"] : null;
    return fullPath;
};
exports.getFullPathFromQuery = getFullPathFromQuery;
