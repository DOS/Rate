"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Heading = void 0;
const react_1 = __importDefault(require("react"));
const utils_1 = require("@/lib/utils");
const variantStyles = {
    heading1: "xl:text-[64px] xl:leading-[77px] md:text-5xl md:leading-[57px] text-[36px] leading-[43px]",
    blogHeading1: "md:text-[40px] md:leading-[52px] text-[26px] leading-[34px]",
    heading2: "xl:text-[40px] xl:leading-[52px] md:text-[34px] md:leading-[44px] text-[28px] leading-[36px]",
    heading3: "xl:text-[32px] xl:leading-[45px] md:text-[28px] md:leading-10 text-xl tracking-xs",
    heading4: "xl:text-2xl xl:leading-[34px] md:text-[22px] md:leading-[30px] text-lg leading-[25px] tracking-xs",
};
const textColorVariants = {
    black: "text-black",
    white: "text-white",
    // more variants will be added here
};
const fontWeightVariants = {
    black: "font-black",
    extraBold: "font-extrabold",
    bold: "font-bold",
    semiBold: "font-semibold",
    medium: "font-medium",
    normal: "font-normal",
    light: "font-light",
    extraLight: "font-extraLight",
    thin: "font-thin",
};
const Heading = ({ children, className, variant = "heading3", textColor = "black", fontWeight = "semiBold", tag = "h3", id, }) => {
    const selectedVariant = variantStyles[variant];
    const selectedTextColor = textColorVariants[textColor];
    const selectedFontWeight = fontWeightVariants[fontWeight];
    const Tag = tag;
    if (!Tag) {
        return null;
    }
    return (<Tag id={id} className={(0, utils_1.cn)(`typo-${tag}`, selectedVariant, selectedTextColor, selectedFontWeight, className)}>
      {children}
    </Tag>);
};
exports.Heading = Heading;
exports.Heading.displayName = "Heading";
exports.default = exports.Heading;
