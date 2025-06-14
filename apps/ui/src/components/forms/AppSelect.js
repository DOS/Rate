"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppSelect = void 0;
const react_1 = __importDefault(require("react"));
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("@/lib/utils");
const AppFormDescription_1 = require("@/components/forms/AppFormDescription");
const AppFormLabel_1 = require("@/components/forms/AppFormLabel");
const form_1 = require("@/components/ui/form");
const select_1 = require("@/components/ui/select");
function AppSelect({ name, options, label, placeholder, containerClassName, fieldClassName, description, ...nativeProps }) {
    const { control } = (0, react_hook_form_1.useFormContext)();
    return (<form_1.FormField control={control} name={name} render={({ field, fieldState }) => (<form_1.FormItem className={(0, utils_1.cn)(containerClassName)}>
          <AppFormLabel_1.AppFormLabel label={label} fieldState={fieldState} required={nativeProps.required}/>

          <select_1.Select {...field} {...nativeProps} dir={(nativeProps.dir ?? "ltr")} onValueChange={field.onChange} defaultValue={field.value}>
            <form_1.FormControl>
              <select_1.SelectTrigger className={(0, utils_1.cn)("w-full", { "border-red-600": fieldState.invalid }, fieldClassName)} tabIndex={nativeProps.tabIndex} onBlur={field.onBlur}>
                <select_1.SelectValue placeholder={placeholder}/>
              </select_1.SelectTrigger>
            </form_1.FormControl>

            <select_1.SelectContent className={(0, utils_1.cn)("max-h-40 overflow-y-auto")}>
              {options.map((option) => (<select_1.SelectItem value={option.value} key={option.value}>
                  {option.label}
                </select_1.SelectItem>))}
            </select_1.SelectContent>
          </select_1.Select>

          <AppFormDescription_1.AppFormDescription description={description}/>

          <form_1.FormMessage />
        </form_1.FormItem>)}/>);
}
exports.AppSelect = AppSelect;
