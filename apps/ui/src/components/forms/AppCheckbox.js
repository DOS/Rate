"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppCheckbox = void 0;
const react_1 = __importDefault(require("react"));
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("@/lib/utils");
const checkbox_1 = require("@/components/ui/checkbox");
const form_1 = require("@/components/ui/form");
const AppFormDescription_1 = require("./AppFormDescription");
const AppFormLabel_1 = require("./AppFormLabel");
function AppCheckbox({ name, label, containerClassName, fieldClassName, description, ...nativeProps }) {
    const { control } = (0, react_hook_form_1.useFormContext)();
    return (<form_1.FormField control={control} name={name} render={({ field, fieldState }) => (<form_1.FormItem className={(0, utils_1.cn)(containerClassName, "flex flex-col justify-center justify-items-center")}>
          <div className="flex flex-row items-start space-y-0 space-x-3">
            <form_1.FormControl>
              <checkbox_1.Checkbox {...field} {...nativeProps} checked={field.value} onCheckedChange={field.onChange} className={fieldClassName}/>
            </form_1.FormControl>

            <div className="space-y-1 leading-none">
              <AppFormLabel_1.AppFormLabel label={label} fieldState={fieldState} required={nativeProps.required}/>

              <AppFormDescription_1.AppFormDescription description={description}/>
            </div>
          </div>

          <form_1.FormMessage />
        </form_1.FormItem>)}/>);
}
exports.AppCheckbox = AppCheckbox;
