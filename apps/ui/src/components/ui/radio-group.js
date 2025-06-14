"use client";
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
exports.RadioGroupItem = exports.RadioGroup = void 0;
const React = __importStar(require("react"));
const react_icons_1 = require("@radix-ui/react-icons");
const RadioGroupPrimitive = __importStar(require("@radix-ui/react-radio-group"));
const utils_1 = require("@/lib/utils");
const RadioGroup = React.forwardRef(({ className, ...props }, ref) => {
    return (<RadioGroupPrimitive.Root className={(0, utils_1.cn)("grid gap-2", className)} {...props} ref={ref}/>);
});
exports.RadioGroup = RadioGroup;
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;
const RadioGroupItem = React.forwardRef(({ className, children, ...props }, ref) => {
    return (<RadioGroupPrimitive.Item ref={ref} className={(0, utils_1.cn)("border-primary text-primary focus-visible:ring-ring aspect-square h-4 w-4 rounded-full border shadow-sm focus:outline-hidden focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <react_icons_1.CheckIcon className="fill-primary h-3.5 w-3.5"/>
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>);
});
exports.RadioGroupItem = RadioGroupItem;
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;
