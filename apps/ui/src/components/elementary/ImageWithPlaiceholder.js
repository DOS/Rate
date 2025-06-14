"use strict";
/* eslint-disable jsx-a11y/alt-text */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageWithPlaiceholder = void 0;
const image_1 = __importDefault(require("next/image"));
const plaiceholder_1 = require("plaiceholder");
const constants_1 = require("@/lib/constants");
const strapi_helpers_1 = require("@/lib/strapi-helpers");
const generatePlaceholder = async (src) => {
    try {
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        try {
            const { metadata: { height, width }, ...plaiceholder } = await (0, plaiceholder_1.getPlaiceholder)(buffer, { size: 10 });
            return {
                plaiceholder,
                img: { src, height, width },
            };
        }
        catch (e) {
            console.error(`Plaiceholder generation for image ${src} failed: `, e);
            return { plaiceholderError: true };
        }
    }
    catch (e) {
        console.error(`Image ${src} wasn't fetched: `, e);
        return null;
    }
};
const ImageWithPlaiceholder = async (props) => {
    const src = (0, strapi_helpers_1.formatStrapiMediaUrl)(props.src);
    const fallbackSrc = (0, strapi_helpers_1.formatStrapiMediaUrl)(props.fallbackSrc);
    const srcPlaceholder = src != null ? await generatePlaceholder(src) : undefined;
    const fallbackSrcPlaceholder = srcPlaceholder == null && fallbackSrc != null
        ? await generatePlaceholder(fallbackSrc)
        : undefined;
    const placeholder = srcPlaceholder ?? fallbackSrcPlaceholder;
    // eslint-disable-next-line no-unused-vars
    const { fallbackSrc: fallback, ...imageProps } = props;
    if (placeholder == null) {
        // Image and fallback image weren't loaded -> show local fallback image
        return (<image_1.default {...imageProps} src={constants_1.FALLBACK_IMAGE_PATH} width={50} height={50}/>);
    }
    if (placeholder.plaiceholderError) {
        // Plaiceholder generation failed -> show image as it is
        return <image_1.default {...imageProps}/>;
    }
    return (<image_1.default placeholder="blur" blurDataURL={placeholder.plaiceholder.base64} {...imageProps} {...placeholder.img}/>);
};
exports.ImageWithPlaiceholder = ImageWithPlaiceholder;
