"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const controller_1 = __importDefault(require("./controller"));
const dynamic_field_1 = __importDefault(require("./dynamic-field"));
exports.default = {
    controller: controller_1.default,
    'dynamic-field': dynamic_field_1.default,
};
