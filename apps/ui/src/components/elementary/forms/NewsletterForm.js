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
exports.newsletterForm = exports.NewsletterForm = void 0;
const zod_1 = require("@hookform/resolvers/zod");
const lucide_react_1 = require("lucide-react");
const react_hook_form_1 = require("react-hook-form");
const z = __importStar(require("zod"));
const AppField_1 = require("@/components/forms/AppField");
const AppForm_1 = require("@/components/forms/AppForm");
const button_1 = require("@/components/ui/button");
function NewsletterForm() {
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(NewsletterFormSchema),
        mode: "onBlur",
        reValidateMode: "onSubmit",
        defaultValues: { email: "" },
    });
    async function onSubmit(values) {
        // TODO: Add submit logic
        // eslint-disable-next-line no-console
        console.log("Form submitted", values);
    }
    return (<div className="flex w-full flex-col">
      <AppForm_1.AppForm form={form} onSubmit={onSubmit} id={exports.newsletterForm} className="w-full">
        <div className="relative">
          <AppField_1.AppField name="email" type="text" autoComplete="email" required fieldClassName="h-14 bg-white" aria-label="email"/>
          <button_1.Button type="submit" className="absolute top-1/2 right-3 -translate-y-1/2 md:w-fit" form={exports.newsletterForm} aria-label="Submit form">
            <lucide_react_1.MoveRight className="size-4"/>
          </button_1.Button>
        </div>
      </AppForm_1.AppForm>
    </div>);
}
exports.NewsletterForm = NewsletterForm;
const NewsletterFormSchema = z.object({
    email: z.string().email(),
});
exports.newsletterForm = "newsletterForm";
