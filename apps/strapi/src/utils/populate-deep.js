"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFullPopulateObject = void 0;
const { isEmpty, merge } = require("lodash/fp");
const skipCreatorFields = true;
const getModelPopulationAttributes = (model) => {
    if (model.uid === "plugin::upload.file") {
        const { related, ...attributes } = model.attributes;
        return attributes;
    }
    return model.attributes;
};
const getFullPopulateObject = (modelUid, maxDepth = 10, ignore) => {
    if (maxDepth <= 1) {
        return true;
    }
    if (modelUid === "admin::user" && skipCreatorFields) {
        return undefined;
    }
    const populate = {};
    const model = strapi.getModel(modelUid);
    if (ignore && !ignore.includes(model.collectionName)) {
        ignore.push(model.collectionName);
    }
    for (const [key, value] of Object.entries(getModelPopulationAttributes(model))) {
        if (ignore?.includes(key)) {
            continue;
        }
        if (value) {
            if (value.type === "component") {
                populate[key] = (0, exports.getFullPopulateObject)(value.component, maxDepth - 1);
            }
            else if (value.type === "dynamiczone") {
                const dynamicPopulate = value.components.reduce((prev, cur) => {
                    const curPopulate = (0, exports.getFullPopulateObject)(cur, maxDepth - 1);
                    return merge(prev, { [cur]: curPopulate });
                }, {});
                populate[key] = isEmpty(dynamicPopulate)
                    ? true
                    : { on: dynamicPopulate };
            }
            else if (value.type === "relation") {
                const relationPopulate = (0, exports.getFullPopulateObject)(value.target, key === "localizations" && maxDepth > 2 ? 1 : maxDepth - 1, ignore);
                if (relationPopulate) {
                    populate[key] = relationPopulate;
                }
            }
            else if (value.type === "media") {
                populate[key] = true;
            }
        }
    }
    return isEmpty(populate) ? true : { populate };
};
exports.getFullPopulateObject = getFullPopulateObject;
