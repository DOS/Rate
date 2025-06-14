"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertDescription = exports.AlertTitle = exports.Alert = void 0;
/* eslint-disable jsx-a11y/heading-has-content */
const React = __importStar(require("react"));
const class_variance_authority_1 = require("class-variance-authority");
const utils_1 = require("@/lib/utils");
const alertVariants = (0, class_variance_authority_1.cva)("relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7", {
    variants: {
        variant: {
            default: "bg-background text-foreground",
            destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
            warning: "border-warning/50 text-warning dark:border-warning [&>svg]:text-warning",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (<div ref={ref} role="alert" className={(0, utils_1.cn)(alertVariants({ variant }), className)} {...props}/>));
exports.Alert = Alert;
Alert.displayName = "Alert";
const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (<h5 ref={ref} className={(0, utils_1.cn)("mb-1 leading-none font-medium tracking-tight", className)} {...props}/>));
exports.AlertTitle = AlertTitle;
AlertTitle.displayName = "AlertTitle";
const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (<div ref={ref} className={(0, utils_1.cn)("text-sm [&_p]:leading-relaxed", className)} {...props}/>));
exports.AlertDescription = AlertDescription;
AlertDescription.displayName = "AlertDescription";
