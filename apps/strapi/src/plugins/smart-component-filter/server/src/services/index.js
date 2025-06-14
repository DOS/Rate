"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const service_1 = __importDefault(require("./service"));
const schema_loader_1 = __importDefault(require("./schema-loader"));
exports.default = {
    service: service_1.default,
    'schema-loader': schema_loader_1.default,
};
