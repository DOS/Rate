"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiImageWithLink = void 0;
const react_1 = __importDefault(require("react"));
const StrapiBasicImage_1 = require("./StrapiBasicImage");
const StrapiLink_1 = require("./StrapiLink");
function StrapiImageWithLink({ component, imageProps, linkProps, }) {
    return (<StrapiLink_1.StrapiLink component={component?.link} {...linkProps}>
      <StrapiBasicImage_1.StrapiBasicImage component={component?.image} {...imageProps}/>
    </StrapiLink_1.StrapiLink>);
}
exports.StrapiImageWithLink = StrapiImageWithLink;
StrapiImageWithLink.displayName = "StrapiImageWithLink";
exports.default = StrapiImageWithLink;
