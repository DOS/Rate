"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CkEditorRenderer = void 0;
const CkEditorCSRRenderer_1 = __importDefault(require("@/components/elementary/ck-editor/CkEditorCSRRenderer"));
const CkEditorSSRRenderer_1 = __importDefault(require("@/components/elementary/ck-editor/CkEditorSSRRenderer"));
require("@/styles/CkEditorDefaultStyles.css");
/**
 * Component that is used to render HTML content from rich text CkEditor in Strapi.
 * @param htmlContent - HTML parsable content
 * @param className - override for custom styling of the content
 * @returns React.ReactNode | null
 */
const CkEditorRenderer = (props) => {
    return (<div className="ck-content">
      {typeof window === "undefined" ? (<CkEditorSSRRenderer_1.default {...props}/>) : (<CkEditorCSRRenderer_1.default {...props}/>)}
    </div>);
};
exports.CkEditorRenderer = CkEditorRenderer;
exports.default = exports.CkEditorRenderer;
