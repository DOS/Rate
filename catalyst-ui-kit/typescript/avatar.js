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
exports.AvatarButton = exports.Avatar = void 0;
const Headless = __importStar(require("@headlessui/react"));
const clsx_1 = __importDefault(require("clsx"));
const react_1 = __importStar(require("react"));
const button_1 = require("./button");
const link_1 = require("./link");
function Avatar({ src = null, square = false, initials, alt = '', className, ...props }) {
    return (<span data-slot="avatar" {...props} className={(0, clsx_1.default)(className, 
        // Basic layout
        'inline-grid shrink-0 align-middle [--avatar-radius:20%] *:col-start-1 *:row-start-1', 'outline -outline-offset-1 outline-black/10 dark:outline-white/10', 
        // Border radius
        square ? 'rounded-(--avatar-radius) *:rounded-(--avatar-radius)' : 'rounded-full *:rounded-full')}>
      {initials && (<svg className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none" viewBox="0 0 100 100" aria-hidden={alt ? undefined : 'true'}>
          {alt && <title>{alt}</title>}
          <text x="50%" y="50%" alignmentBaseline="middle" dominantBaseline="middle" textAnchor="middle" dy=".125em">
            {initials}
          </text>
        </svg>)}
      {src && <img className="size-full" src={src} alt={alt}/>}
    </span>);
}
exports.Avatar = Avatar;
exports.AvatarButton = (0, react_1.forwardRef)(function AvatarButton({ src, square = false, initials, alt, className, ...props }, ref) {
    let classes = (0, clsx_1.default)(className, square ? 'rounded-[20%]' : 'rounded-full', 'relative inline-grid focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500');
    return 'href' in props ? (<link_1.Link {...props} className={classes} ref={ref}>
      <button_1.TouchTarget>
        <Avatar src={src} square={square} initials={initials} alt={alt}/>
      </button_1.TouchTarget>
    </link_1.Link>) : (<Headless.Button {...props} className={classes} ref={ref}>
      <button_1.TouchTarget>
        <Avatar src={src} square={square} initials={initials} alt={alt}/>
      </button_1.TouchTarget>
    </Headless.Button>);
});
