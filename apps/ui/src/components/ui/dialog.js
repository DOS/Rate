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
exports.DialogDescription = exports.DialogTitle = exports.DialogFooter = exports.DialogHeader = exports.DialogContent = exports.DialogClose = exports.DialogTrigger = exports.DialogOverlay = exports.DialogPortal = exports.Dialog = void 0;
const React = __importStar(require("react"));
const DialogPrimitive = __importStar(require("@radix-ui/react-dialog"));
const react_icons_1 = require("@radix-ui/react-icons");
const utils_1 = require("@/lib/utils");
const Dialog = DialogPrimitive.Root;
exports.Dialog = Dialog;
const DialogTrigger = DialogPrimitive.Trigger;
exports.DialogTrigger = DialogTrigger;
const DialogPortal = DialogPrimitive.Portal;
exports.DialogPortal = DialogPortal;
const DialogClose = DialogPrimitive.Close;
exports.DialogClose = DialogClose;
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (<DialogPrimitive.Overlay ref={ref} className={(0, utils_1.cn)("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80", className)} {...props}/>));
exports.DialogOverlay = DialogOverlay;
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (<DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content ref={ref} className={(0, utils_1.cn)("bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg", className)} {...props}>
      {children}
      <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
        <react_icons_1.Cross2Icon className="h-4 w-4"/>
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>));
exports.DialogContent = DialogContent;
DialogContent.displayName = DialogPrimitive.Content.displayName;
const DialogHeader = ({ className, ...props }) => (<div className={(0, utils_1.cn)("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props}/>);
exports.DialogHeader = DialogHeader;
DialogHeader.displayName = "DialogHeader";
const DialogFooter = ({ className, ...props }) => (<div className={(0, utils_1.cn)("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props}/>);
exports.DialogFooter = DialogFooter;
DialogFooter.displayName = "DialogFooter";
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (<DialogPrimitive.Title ref={ref} className={(0, utils_1.cn)("text-lg leading-none font-semibold tracking-tight", className)} {...props}/>));
exports.DialogTitle = DialogTitle;
DialogTitle.displayName = DialogPrimitive.Title.displayName;
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (<DialogPrimitive.Description ref={ref} className={(0, utils_1.cn)("text-muted-foreground text-sm", className)} {...props}/>));
exports.DialogDescription = DialogDescription;
DialogDescription.displayName = DialogPrimitive.Description.displayName;
