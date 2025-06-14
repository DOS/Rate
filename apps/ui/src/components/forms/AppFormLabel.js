"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppFormLabel = void 0;
const react_1 = __importDefault(require("react"));
const utils_1 = require("@/lib/utils");
const form_1 = require("@/components/ui/form");
function AppFormLabel({ fieldState, label, required, className, }) {
    if (label == null) {
        return null;
    }
    return (<form_1.FormLabel className={(0, utils_1.cn)({
            "font-normal": !fieldState?.invalid,
            "font-medium": fieldState?.invalid,
        }, className)}>
      {label}
      {required && <span className="text-red-500">*</span>}
    </form_1.FormLabel>);
}
exports.AppFormLabel = AppFormLabel;
