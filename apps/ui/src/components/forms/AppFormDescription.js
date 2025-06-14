"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppFormDescription = void 0;
const react_1 = __importDefault(require("react"));
const form_1 = require("@/components/ui/form");
function AppFormDescription({ description }) {
    if (description == null) {
        return null;
    }
    return <form_1.FormDescription>{description}</form_1.FormDescription>;
}
exports.AppFormDescription = AppFormDescription;
