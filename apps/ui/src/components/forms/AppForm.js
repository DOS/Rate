"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppForm = void 0;
const react_hook_form_1 = require("react-hook-form");
function AppForm({ onSubmit, onError = () => { }, children, className, id, form, disabled, }) {
    const { handleSubmit } = form;
    return (<react_hook_form_1.FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit, onError)} className={className} id={id} noValidate>
        <fieldset disabled={disabled} className="space-y-4">
          {children}
        </fieldset>
      </form>
    </react_hook_form_1.FormProvider>);
}
exports.AppForm = AppForm;
