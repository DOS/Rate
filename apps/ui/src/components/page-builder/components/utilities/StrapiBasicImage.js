"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiBasicImage = void 0;
const image_1 = __importDefault(require("next/image"));
const strapi_helpers_1 = require("@/lib/strapi-helpers");
const ImageWithFallback_1 = require("@/components/elementary/ImageWithFallback");
function StrapiBasicImage({ component, className, hideWhenMissing, fallbackSizes, forcedSizes, format, useNativeNextImageOnly, ...imgProps }) {
    const media = component?.media;
    const selectedFormat = format ? media?.formats?.[format] : undefined;
    const url = selectedFormat?.url ?? media?.url;
    if (url == null && hideWhenMissing) {
        return null;
    }
    const ImageComp = useNativeNextImageOnly ? image_1.default : ImageWithFallback_1.ImageWithFallback;
    // TODO: the placeholder library is not working properly and crashes the storybook - revise its usage
    // const ImageComp = useClient ? ImageWithFallback : ImageWithPlaiceholder
    // useClient  ? ImageWithFallback : ImageWithPlaiceholder
    const sizes = {
        width: forcedSizes?.width ??
            component?.width ??
            selectedFormat?.width ??
            media?.width ??
            fallbackSizes?.width ??
            undefined,
        height: forcedSizes?.height ??
            component?.height ??
            selectedFormat?.height ??
            media?.height ??
            fallbackSizes?.height ??
            undefined,
    };
    const src = (0, strapi_helpers_1.formatStrapiMediaUrl)(url);
    const fallbackSrc = (0, strapi_helpers_1.formatStrapiMediaUrl)(component?.fallbackSrc);
    if (imgProps.fill) {
        // Fill has priority over sizes
        sizes.width = undefined;
        sizes.height = undefined;
    }
    if (!imgProps.fill && (!sizes.width || !sizes.height)) {
        // If width or height is missing, fill the image
        // This happens mostly if there is no media in Strapi and
        // we are using a fallback image
        imgProps.fill = true;
        sizes.width = undefined;
        sizes.height = undefined;
    }
    return (<ImageComp style={{ ...sizes, ...imgProps.style }} className={className} src={src} fallbackSrc={fallbackSrc} alt={component?.alt ?? media?.caption ?? media?.alternativeText ?? ""} {...sizes} {...imgProps}/>);
}
exports.StrapiBasicImage = StrapiBasicImage;
StrapiBasicImage.displayName = "StrapiBasicImage";
