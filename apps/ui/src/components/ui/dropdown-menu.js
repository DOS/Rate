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
exports.DropdownMenuRadioGroup = exports.DropdownMenuSubTrigger = exports.DropdownMenuSubContent = exports.DropdownMenuSub = exports.DropdownMenuPortal = exports.DropdownMenuGroup = exports.DropdownMenuShortcut = exports.DropdownMenuSeparator = exports.DropdownMenuLabel = exports.DropdownMenuRadioItem = exports.DropdownMenuCheckboxItem = exports.DropdownMenuItem = exports.DropdownMenuContent = exports.DropdownMenuTrigger = exports.DropdownMenu = void 0;
const React = __importStar(require("react"));
const DropdownMenuPrimitive = __importStar(require("@radix-ui/react-dropdown-menu"));
const react_icons_1 = require("@radix-ui/react-icons");
const utils_1 = require("@/lib/utils");
const DropdownMenu = DropdownMenuPrimitive.Root;
exports.DropdownMenu = DropdownMenu;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
exports.DropdownMenuTrigger = DropdownMenuTrigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
exports.DropdownMenuGroup = DropdownMenuGroup;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
exports.DropdownMenuPortal = DropdownMenuPortal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
exports.DropdownMenuSub = DropdownMenuSub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
exports.DropdownMenuRadioGroup = DropdownMenuRadioGroup;
const DropdownMenuSubTrigger = React.forwardRef(({ className, inset, children, ...props }, ref) => (<DropdownMenuPrimitive.SubTrigger ref={ref} className={(0, utils_1.cn)("focus:bg-accent data-[state=open]:bg-accent flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none", inset && "pl-8", className)} {...props}>
    {children}
    <react_icons_1.ChevronRightIcon className="ml-auto h-4 w-4"/>
  </DropdownMenuPrimitive.SubTrigger>));
exports.DropdownMenuSubTrigger = DropdownMenuSubTrigger;
DropdownMenuSubTrigger.displayName =
    DropdownMenuPrimitive.SubTrigger.displayName;
const DropdownMenuSubContent = React.forwardRef(({ className, ...props }, ref) => (<DropdownMenuPrimitive.SubContent ref={ref} className={(0, utils_1.cn)("bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-lg", className)} {...props}/>));
exports.DropdownMenuSubContent = DropdownMenuSubContent;
DropdownMenuSubContent.displayName =
    DropdownMenuPrimitive.SubContent.displayName;
const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (<DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={(0, utils_1.cn)("bg-popover text-popover-foreground z-50 min-w-[8rem] overflow-hidden rounded-md border p-1 shadow-md", "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className)} {...props}/>
  </DropdownMenuPrimitive.Portal>));
exports.DropdownMenuContent = DropdownMenuContent;
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
const DropdownMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (<DropdownMenuPrimitive.Item ref={ref} className={(0, utils_1.cn)("focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50", inset && "pl-8", className)} {...props}/>));
exports.DropdownMenuItem = DropdownMenuItem;
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => (<DropdownMenuPrimitive.CheckboxItem ref={ref} className={(0, utils_1.cn)("focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50", className)} checked={checked} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <react_icons_1.CheckIcon className="h-4 w-4"/>
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>));
exports.DropdownMenuCheckboxItem = DropdownMenuCheckboxItem;
DropdownMenuCheckboxItem.displayName =
    DropdownMenuPrimitive.CheckboxItem.displayName;
const DropdownMenuRadioItem = React.forwardRef(({ className, children, ...props }, ref) => (<DropdownMenuPrimitive.RadioItem ref={ref} className={(0, utils_1.cn)("focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-50", className)} {...props}>
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <react_icons_1.DotFilledIcon className="h-4 w-4 fill-current"/>
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>));
exports.DropdownMenuRadioItem = DropdownMenuRadioItem;
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;
const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (<DropdownMenuPrimitive.Label ref={ref} className={(0, utils_1.cn)("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props}/>));
exports.DropdownMenuLabel = DropdownMenuLabel;
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;
const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (<DropdownMenuPrimitive.Separator ref={ref} className={(0, utils_1.cn)("bg-muted -mx-1 my-1 h-px", className)} {...props}/>));
exports.DropdownMenuSeparator = DropdownMenuSeparator;
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
const DropdownMenuShortcut = ({ className, ...props }) => {
    return (<span className={(0, utils_1.cn)("ml-auto text-xs tracking-widest opacity-60", className)} {...props}/>);
};
exports.DropdownMenuShortcut = DropdownMenuShortcut;
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";
