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
exports.TabsContent = exports.TabsTrigger = exports.TabsList = exports.Tabs = void 0;
const React = __importStar(require("react"));
const TabsPrimitive = __importStar(require("@radix-ui/react-tabs"));
const utils_1 = require("@/lib/utils");
const Tabs = TabsPrimitive.Root;
exports.Tabs = Tabs;
const TabsList = React.forwardRef(({ className, ...props }, ref) => (<TabsPrimitive.List ref={ref} className={(0, utils_1.cn)("bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1", className)} {...props}/>));
exports.TabsList = TabsList;
TabsList.displayName = TabsPrimitive.List.displayName;
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (<TabsPrimitive.Trigger ref={ref} className={(0, utils_1.cn)("ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm", className)} {...props}/>));
exports.TabsTrigger = TabsTrigger;
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
const TabsContent = React.forwardRef(({ className, ...props }, ref) => (<TabsPrimitive.Content ref={ref} className={(0, utils_1.cn)("ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden", className)} {...props}/>));
exports.TabsContent = TabsContent;
TabsContent.displayName = TabsPrimitive.Content.displayName;
