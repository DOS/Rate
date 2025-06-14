/* eslint-disable jsx-a11y/alt-text */
"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageWithFallback = void 0;
const react_1 = require("react");
const image_1 = __importDefault(require("next/image"));
const constants_1 = require("@/lib/constants");
const ImageWithBlur_1 = require("./ImageWithBlur");
const invalidSrc = "/invalid-src.jpg";
const ImageWithFallback = ({ fallbackSrc, src: originalSrc, blurOff, ...imgProps }) => {
    const [src, setSrc] = (0, react_1.useState)(originalSrc ?? fallbackSrc ?? invalidSrc);
    (0, react_1.useEffect)(() => {
        setSrc(originalSrc ?? fallbackSrc ?? invalidSrc);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [originalSrc]);
    const handleLoadError = (e) => {
        console.error(`Error loading image from ${src}:`, e);
        if (fallbackSrc) {
            setSrc(fallbackSrc);
        }
        else {
            setSrc(constants_1.FALLBACK_IMAGE_PATH);
        }
        imgProps?.onError?.(e);
    };
    if (blurOff) {
        return <image_1.default src={src} {...imgProps} onError={handleLoadError}/>;
    }
    return <ImageWithBlur_1.ImageWithBlur src={src} {...imgProps} onError={handleLoadError}/>;
};
exports.ImageWithFallback = ImageWithFallback;
