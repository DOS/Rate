"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppField = void 0;
const react_1 = __importDefault(require("react"));
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("@/lib/utils");
const form_1 = require("@/components/ui/form");
const input_1 = require("@/components/ui/input");
const AppFormDescription_1 = require("./AppFormDescription");
const AppFormLabel_1 = require("./AppFormLabel");
function AppField({ name, label, endAdornment, containerClassName, fieldClassName, description, ...nativeProps }) {
    const { control } = (0, react_hook_form_1.useFormContext)();
    return (<form_1.FormField control={control} name={name} render={({ field, fieldState }) => (<form_1.FormItem className={(0, utils_1.cn)(containerClassName)}>
          <AppFormLabel_1.AppFormLabel fieldState={fieldState} label={label} required={nativeProps.required}/>

          <form_1.FormControl>
            <div className="relative flex items-stretch overflow-hidden">
              <input_1.Input {...field} {...nativeProps} value={field.value ?? ""} onChange={(event) => {
                const value = event.target.value;
                if (nativeProps.type === "number") {
                    field.onChange(parseFloat(value));
                }
                else {
                    field.onChange(value);
                }
            }} className={(0, utils_1.cn)("w-full", {
                "border-red-600": fieldState.invalid,
                "rounded-md border": !endAdornment,
                "rounded-l-md border-y border-l": !!endAdornment,
            }, fieldClassName)}/>
              {endAdornment && (<div className={(0, utils_1.cn)("flex items-center rounded-r-md border bg-gray-100 px-2", {
                    "border-y-red-600 border-r-red-600 text-red-600": fieldState.invalid,
                    "border-gray-100": !fieldState.invalid,
                })}>
                  {endAdornment}
                </div>)}
            </div>
          </form_1.FormControl>

          <AppFormDescription_1.AppFormDescription description={description}/>

          <form_1.FormMessage />
        </form_1.FormItem>)}/>);
}
exports.AppField = AppField;
