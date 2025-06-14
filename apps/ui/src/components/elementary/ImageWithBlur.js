"use strict";
/* eslint-disable jsx-a11y/alt-text */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageWithBlur = void 0;
const image_1 = __importDefault(require("next/image"));
const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const triplet = (e1, e2, e3) => keyStr.charAt(e1 >> 2) +
    keyStr.charAt(((e1 & 3) << 4) | (e2 >> 4)) +
    keyStr.charAt(((e2 & 15) << 2) | (e3 >> 6)) +
    keyStr.charAt(e3 & 63);
const rgbDataURL = (r, g, b) => `data:image/gif;base64,R0lGODlhAQABAPAA${triplet(0, r, g) + triplet(b, 255, 255)}/yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==`;
// More info about the blurEffect check
// https://png-pixel.com
const ImageWithBlur = ({ blurRgb = [255, 255, 255], ...imgProps }) => {
    return (<image_1.default placeholder="blur" blurDataURL={rgbDataURL(...blurRgb)} {...imgProps}/>);
};
exports.ImageWithBlur = ImageWithBlur;
