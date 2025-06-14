'use client';
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarLabel = exports.SidebarItem = exports.SidebarHeading = exports.SidebarSpacer = exports.SidebarDivider = exports.SidebarSection = exports.SidebarFooter = exports.SidebarBody = exports.SidebarHeader = exports.Sidebar = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const framer_motion_1 = require("framer-motion");
const react_1 = __importStar(require("react"));
const button_1 = require("./button");
const link_1 = require("./link");
function Sidebar({ className, ...props }) {
    return <nav {...props} className={(0, clsx_1.default)(className, 'flex h-full min-h-0 flex-col')}/>;
}
exports.Sidebar = Sidebar;
function SidebarHeader({ className, ...props }) {
    return (<div {...props} className={(0, clsx_1.default)(className, 'flex flex-col border-b border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5')}/>);
}
exports.SidebarHeader = SidebarHeader;
function SidebarBody({ className, ...props }) {
    return (<div {...props} className={(0, clsx_1.default)(className, 'flex flex-1 flex-col overflow-y-auto p-4 [&>[data-slot=section]+[data-slot=section]]:mt-8')}/>);
}
exports.SidebarBody = SidebarBody;
function SidebarFooter({ className, ...props }) {
    return (<div {...props} className={(0, clsx_1.default)(className, 'flex flex-col border-t border-zinc-950/5 p-4 dark:border-white/5 [&>[data-slot=section]+[data-slot=section]]:mt-2.5')}/>);
}
exports.SidebarFooter = SidebarFooter;
function SidebarSection({ className, ...props }) {
    let id = (0, react_1.useId)();
    return (<framer_motion_1.LayoutGroup id={id}>
      <div {...props} data-slot="section" className={(0, clsx_1.default)(className, 'flex flex-col gap-0.5')}/>
    </framer_motion_1.LayoutGroup>);
}
exports.SidebarSection = SidebarSection;
function SidebarDivider({ className, ...props }) {
    return <hr {...props} className={(0, clsx_1.default)(className, 'my-4 border-t border-zinc-950/5 lg:-mx-4 dark:border-white/5')}/>;
}
exports.SidebarDivider = SidebarDivider;
function SidebarSpacer({ className, ...props }) {
    return <div aria-hidden="true" {...props} className={(0, clsx_1.default)(className, 'mt-8 flex-1')}/>;
}
exports.SidebarSpacer = SidebarSpacer;
function SidebarHeading({ className, ...props }) {
    return (<h3 {...props} className={(0, clsx_1.default)(className, 'mb-1 px-2 text-xs/6 font-medium text-zinc-500 dark:text-zinc-400')}/>);
}
exports.SidebarHeading = SidebarHeading;
exports.SidebarItem = (0, react_1.forwardRef)(function SidebarItem({ current, className, children, ...props }, ref) {
    let classes = (0, clsx_1.default)(
    // Base
    'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-base/6 font-medium text-zinc-950 sm:py-2 sm:text-sm/5', 
    // Leading icon/icon-only
    '*:data-[slot=icon]:size-6 *:data-[slot=icon]:shrink-0 *:data-[slot=icon]:fill-zinc-500 sm:*:data-[slot=icon]:size-5', 
    // Trailing icon (down chevron or similar)
    '*:last:data-[slot=icon]:ml-auto *:last:data-[slot=icon]:size-5 sm:*:last:data-[slot=icon]:size-4', 
    // Avatar
    '*:data-[slot=avatar]:-m-0.5 *:data-[slot=avatar]:size-7 sm:*:data-[slot=avatar]:size-6', 
    // Hover
    'data-hover:bg-zinc-950/5 data-hover:*:data-[slot=icon]:fill-zinc-950', 
    // Active
    'data-active:bg-zinc-950/5 data-active:*:data-[slot=icon]:fill-zinc-950', 
    // Current
    'data-current:*:data-[slot=icon]:fill-zinc-950', 
    // Dark mode
    'dark:text-white dark:*:data-[slot=icon]:fill-zinc-400', 'dark:data-hover:bg-white/5 dark:data-hover:*:data-[slot=icon]:fill-white', 'dark:data-active:bg-white/5 dark:data-active:*:data-[slot=icon]:fill-white', 'dark:data-current:*:data-[slot=icon]:fill-white');
    return (<span className={(0, clsx_1.default)(className, 'relative')}>
      {current && (<framer_motion_1.motion.span layoutId="current-indicator" className="absolute inset-y-2 -left-4 w-0.5 rounded-full bg-zinc-950 dark:bg-white"/>)}
      {'href' in props ? (<Headless.CloseButton as={link_1.Link} {...props} className={classes} data-current={current ? 'true' : undefined} ref={ref}>
          <button_1.TouchTarget>{children}</button_1.TouchTarget>
        </Headless.CloseButton>) : (<Headless.Button {...props} className={(0, clsx_1.default)('cursor-default', classes)} data-current={current ? 'true' : undefined} ref={ref}>
          <button_1.TouchTarget>{children}</button_1.TouchTarget>
        </Headless.Button>)}
    </span>);
});
function SidebarLabel({ className, ...props }) {
    return <span {...props} className={(0, clsx_1.default)(className, 'truncate')}/>;
}
exports.SidebarLabel = SidebarLabel;
