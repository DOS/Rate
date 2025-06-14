"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiStructuredData = void 0;
const script_1 = __importDefault(require("next/script"));
const StrapiStructuredData = ({ structuredData, }) => {
    if (structuredData) {
        return (<script_1.default id="articleStructuredData" strategy="afterInteractive" type="application/ld+json" 
        // this content is limited to Strapi and cannot be sourced from users
        dangerouslySetInnerHTML={{
                __html: JSON.stringify(structuredData),
            }}/>);
    }
    return null;
};
exports.StrapiStructuredData = StrapiStructuredData;
exports.StrapiStructuredData.displayName = "StructuredData";
exports.default = exports.StrapiStructuredData;
