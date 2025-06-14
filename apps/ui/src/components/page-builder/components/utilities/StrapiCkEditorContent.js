"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiCkEditorContent = void 0;
const react_1 = __importDefault(require("react"));
const ck_editor_1 = __importDefault(require("@/components/elementary/ck-editor"));
const StrapiCkEditorContent = ({ component, }) => {
    return <ck_editor_1.default htmlContent={component.content}/>;
};
exports.StrapiCkEditorContent = StrapiCkEditorContent;
exports.StrapiCkEditorContent.displayName = "CkEditorContent";
exports.default = exports.StrapiCkEditorContent;
