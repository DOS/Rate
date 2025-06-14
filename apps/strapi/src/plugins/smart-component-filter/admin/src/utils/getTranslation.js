"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTranslation = void 0;
const pluginId_1 = require("../pluginId");
const getTranslation = (id) => `${pluginId_1.PLUGIN_ID}.${id}`;
exports.getTranslation = getTranslation;
