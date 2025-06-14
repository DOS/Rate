"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const script_1 = __importDefault(require("next/script"));
const general_helpers_1 = require("@/lib/general-helpers");
// eslint-disable-next-line no-unused-vars
const TrackingScriptWrapper = ({ id, scriptContent, scriptOptions, ignoreInDevelopment = true, }) => {
    if (ignoreInDevelopment && (0, general_helpers_1.isDevelopment)()) {
        return null;
    }
    return (<script_1.default id={id} dangerouslySetInnerHTML={{ __html: scriptContent }} {...scriptOptions}/>);
};
const TrackingScripts = () => {
    return <>{/* Tracking Scrips here */}</>;
};
exports.default = TrackingScripts;
