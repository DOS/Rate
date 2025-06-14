"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelectField = exports.TextField = void 0;
const react_1 = require("react");
const clsx_1 = __importDefault(require("clsx"));
const formClasses = 'block w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-hidden focus:ring-blue-500 sm:text-sm';
function Label({ id, children }) {
    return (<label htmlFor={id} className="mb-3 block text-sm font-medium text-gray-700">
      {children}
    </label>);
}
function TextField({ label, type = 'text', className, ...props }) {
    let id = (0, react_1.useId)();
    return (<div className={className}>
      {label && <Label id={id}>{label}</Label>}
      <input id={id} type={type} {...props} className={formClasses}/>
    </div>);
}
exports.TextField = TextField;
function SelectField({ label, className, ...props }) {
    let id = (0, react_1.useId)();
    return (<div className={className}>
      {label && <Label id={id}>{label}</Label>}
      <select id={id} {...props} className={(0, clsx_1.default)(formClasses, 'pr-8')}/>
    </div>);
}
exports.SelectField = SelectField;
