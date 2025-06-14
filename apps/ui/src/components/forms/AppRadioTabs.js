"use client";
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppRadioTabs = void 0;
const react_1 = __importDefault(require("react"));
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("@/lib/utils");
const AppFormDescription_1 = require("@/components/forms/AppFormDescription");
const AppFormLabel_1 = require("@/components/forms/AppFormLabel");
const form_1 = require("@/components/ui/form");
const tabs_1 = require("@/components/ui/tabs");
function AppRadioTabs({ name, tabsContent, tabTriggers, label, containerClassName, description, tabListProps, required, }) {
    const { control } = (0, react_hook_form_1.useFormContext)();
    return (<form_1.FormField control={control} name={name} render={({ field, fieldState }) => (<form_1.FormItem className={(0, utils_1.cn)(containerClassName)}>
          <form_1.FormControl>
            <tabs_1.Tabs onValueChange={field.onChange} value={field.value}>
              <div className="flex w-full items-center justify-between">
                <AppFormLabel_1.AppFormLabel label={label} fieldState={fieldState} required={required} className="text-md font-medium"/>

                <tabs_1.TabsList {...tabListProps} className={(0, utils_1.cn)("bg-primary", tabListProps?.className)}>
                  {tabTriggers.map((tabTrigger) => (<tabs_1.TabsTrigger key={tabTrigger.value} value={tabTrigger.value} tabIndex={tabTrigger.tabIndex} className="text-sm text-white/80">
                      {tabTrigger.title}
                    </tabs_1.TabsTrigger>))}
                </tabs_1.TabsList>
              </div>

              {tabsContent.map((tabContent) => (<tabs_1.TabsContent key={tabContent.value} value={tabContent.value}>
                  {tabContent.content}
                </tabs_1.TabsContent>))}
            </tabs_1.Tabs>
          </form_1.FormControl>

          <AppFormDescription_1.AppFormDescription description={description}/>

          <form_1.FormMessage />
        </form_1.FormItem>)}/>);
}
exports.AppRadioTabs = AppRadioTabs;
