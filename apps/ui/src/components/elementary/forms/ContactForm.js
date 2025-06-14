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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactFormName = exports.ContactForm = void 0;
const zod_1 = require("@hookform/resolvers/zod");
const react_query_1 = require("@tanstack/react-query");
const next_intl_1 = require("next-intl");
const react_hook_form_1 = require("react-hook-form");
const z = __importStar(require("zod"));
const strapi_api_1 = require("@/lib/strapi-api");
const AppLink_1 = __importDefault(require("@/components/elementary/AppLink"));
const AppField_1 = require("@/components/forms/AppField");
const AppForm_1 = require("@/components/forms/AppForm");
const AppTextArea_1 = require("@/components/forms/AppTextArea");
const button_1 = require("@/components/ui/button");
const use_toast_1 = require("@/components/ui/use-toast");
function ContactForm({ gdpr, }) {
    const t = (0, next_intl_1.useTranslations)("contactForm");
    const { toast } = (0, use_toast_1.useToast)();
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(ContactFormSchema),
        mode: "onBlur",
        reValidateMode: "onSubmit",
        defaultValues: { name: "", email: "", message: "" },
    });
    const mutation = (0, react_query_1.useMutation)({
        mutationFn: (values) => {
            const path = strapi_api_1.PublicStrapiClient.getStrapiApiPathByUId("api::subscriber.subscriber");
            return strapi_api_1.PublicStrapiClient.fetchAPI(path, undefined, {
                method: "POST",
                body: JSON.stringify({ data: values }),
            });
        },
        onSuccess: () => {
            toast({
                variant: "default",
                description: t("success"),
            });
            form.reset();
        },
    });
    const onSubmit = (values) => {
        mutation.mutate(values);
    };
    return (<div className="flex w-full flex-col">
      <AppForm_1.AppForm form={form} onSubmit={onSubmit} id={exports.contactFormName} className="w-full">
        <AppField_1.AppField name="name" type="text" required label={t("name")} placeholder={t("namePlaceholder")}/>
        <AppField_1.AppField name="email" type="text" autoComplete="email" required label={t("email")} placeholder={t("emailPlaceholder")}/>
        <AppTextArea_1.AppTextArea name="message" type="text" required label={t("message")} aria-label="contact-message"/>
      </AppForm_1.AppForm>
      <div className="flex w-full flex-col gap-4">
        {gdpr?.href && (<div className="mt-5 flex flex-col items-center sm:flex-row">
            <p>{t("gdpr")}</p>
            <AppLink_1.default openExternalInNewTab={gdpr.newTab} className="p-0 pl-1 font-medium" href={gdpr?.href}>
              {gdpr.label || t("gdprLink")}
            </AppLink_1.default>
          </div>)}

        <button_1.Button type="submit" className="mt-4 w-full" size="lg" form={exports.contactFormName}>
          {t("submit")}
        </button_1.Button>
      </div>

      {mutation.error && (<div className="text-center text-red-500">
          <p>{mutation.error.message || t("error")}</p>
        </div>)}
    </div>);
}
exports.ContactForm = ContactForm;
const ContactFormSchema = z.object({
    name: z.string().min(1),
    email: z.string().email().min(1),
    message: z.string().min(10),
});
exports.contactFormName = "contactForm";
