"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Paragraph = exports.textColorVariants = exports.variantStyles = void 0;
const react_1 = __importDefault(require("react"));
const utils_1 = require("@/lib/utils");
exports.variantStyles = {
    base: "text-base leading-[25px]",
    // more variants will be added here
};
exports.textColorVariants = {
    black: "text-black",
    white: "text-white",
    // more variants will be added here
};
const Paragraph = ({ children, className, variant = "base", textColor = "black", }) => {
    const selectedVariant = exports.variantStyles[variant];
    const selectedTextColor = exports.textColorVariants[textColor];
    return (<p className={(0, utils_1.cn)(selectedVariant, selectedTextColor, className)}>
      {children}
    </p>);
};
exports.Paragraph = Paragraph;
exports.Paragraph.displayName = "Paragraph";
exports.default = exports.Paragraph;
