"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppLink = void 0;
const react_1 = __importDefault(require("react"));
const navigation_1 = require("@/lib/navigation");
const utils_1 = require("@/lib/utils");
const button_1 = require("@/components/ui/button");
const AppLink = ({ href, className, children, endAdornment, openExternalInNewTab = false, variant = "link", size = "default", ...props }) => {
    const combinedClassName = (0, utils_1.cn)("group flex flex-row items-center gap-2", (0, button_1.buttonVariants)({ variant, size }), className);
    const formattedHref = (0, navigation_1.formatHref)(href);
    if ((0, navigation_1.isAppLink)(formattedHref)) {
        return (<navigation_1.Link href={formattedHref} {...props} className={combinedClassName}>
        {children}
        {endAdornment && (<span className="transition-transform duration-200 ease-in group-hover:translate-x-2">
            {endAdornment}
          </span>)}
      </navigation_1.Link>);
    }
    return (<a href={formattedHref} target={openExternalInNewTab ? "_blank" : ""} rel={openExternalInNewTab ? "noopener noreferrer" : ""} className={combinedClassName}>
      {children}
      {endAdornment && (<span className="transition-transform duration-200 ease-in group-hover:translate-x-2">
          {endAdornment}
        </span>)}
    </a>);
};
exports.AppLink = AppLink;
exports.AppLink.displayName = "AppLink";
exports.default = exports.AppLink;
