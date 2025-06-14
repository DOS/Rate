"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppTextArea = void 0;
const react_1 = __importDefault(require("react"));
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("@/lib/utils");
const AppFormDescription_1 = require("@/components/forms/AppFormDescription");
const AppFormLabel_1 = require("@/components/forms/AppFormLabel");
const form_1 = require("@/components/ui/form");
const textarea_1 = require("@/components/ui/textarea");
function AppTextArea({ name, label, containerClassName, fieldClassName, description, ...nativeProps }) {
    const { control } = (0, react_hook_form_1.useFormContext)();
    return (<form_1.FormField control={control} name={name} render={({ field, fieldState }) => (<form_1.FormItem className={(0, utils_1.cn)(containerClassName)}>
          <AppFormLabel_1.AppFormLabel fieldState={fieldState} label={label} required={nativeProps.required}/>

          <form_1.FormControl>
            <div className="relative flex items-stretch overflow-hidden">
              <textarea_1.Textarea {...field} value={field.value ?? ""} onChange={field.onChange} className={(0, utils_1.cn)("border-input w-full ease-in-out", {
                "border-red-600": fieldState.invalid,
            }, fieldClassName)}/>
            </div>
          </form_1.FormControl>

          <AppFormDescription_1.AppFormDescription description={description}/>

          <form_1.FormMessage />
        </form_1.FormItem>)}/>);
}
exports.AppTextArea = AppTextArea;
