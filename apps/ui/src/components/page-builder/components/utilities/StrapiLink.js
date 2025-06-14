"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiLink = void 0;
const react_1 = __importDefault(require("react"));
const AppLink_1 = require("@/components/elementary/AppLink");
function StrapiLink({ component, children, className, hideWhenMissing, }) {
    if (component == null && hideWhenMissing) {
        return null;
    }
    if (component?.href == null) {
        return children ?? component?.label ?? null;
    }
    return (<AppLink_1.AppLink href={component.href} openExternalInNewTab={component.newTab ?? false} className={className}>
      {children ?? component.label}
    </AppLink_1.AppLink>);
}
exports.StrapiLink = StrapiLink;
StrapiLink.displayName = "StrapiLink";
exports.default = StrapiLink;
