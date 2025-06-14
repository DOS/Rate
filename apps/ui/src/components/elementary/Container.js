"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Container = void 0;
const react_1 = __importDefault(require("react"));
const utils_1 = require("@/lib/utils");
const Container = ({ children, className, hideDefaultPadding, }) => {
    return (<div className={(0, utils_1.cn)("mx-auto w-full", hideDefaultPadding ? "max-w-screen-default" : "max-w-[1296px] px-6", className)}>
      {children}
    </div>);
};
exports.Container = Container;
