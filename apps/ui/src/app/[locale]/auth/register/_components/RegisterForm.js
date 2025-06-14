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
exports.RegisterForm = void 0;
const zod_1 = require("@hookform/resolvers/zod");
const react_query_1 = require("@tanstack/react-query");
const next_intl_1 = require("next-intl");
const react_hook_form_1 = require("react-hook-form");
const z = __importStar(require("zod"));
const constants_1 = require("@/lib/constants");
const navigation_1 = require("@/lib/navigation");
const strapi_api_1 = require("@/lib/strapi-api");
const utils_1 = require("@/lib/utils");
const AppField_1 = require("@/components/forms/AppField");
const AppForm_1 = require("@/components/forms/AppForm");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const use_toast_1 = require("@/components/ui/use-toast");
// To enable email confirmation, Strapi Users-Permissions plugin must be configured (e.g. email provider, redirect URL)
// http://localhost:1337/admin/settings/users-permissions/advanced-settings
const ENABLE_EMAIL_CONFIRMATION = false;
function RegisterForm() {
    const t = (0, next_intl_1.useTranslations)("auth.register");
    const { toast } = (0, use_toast_1.useToast)();
    const { mutate, isSuccess } = (0, react_query_1.useMutation)({
        mutationFn: (values) => strapi_api_1.PrivateStrapiClient.fetchAPI(`/auth/local/register`, undefined, {
            body: JSON.stringify(values),
            method: "POST",
            next: { revalidate: 0 },
        }, { omitUserAuthorization: true }),
    });
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(RegisterFormSchema),
        mode: "onBlur",
        reValidateMode: "onBlur",
        defaultValues: {
            email: "",
            password: "",
            passwordConfirmation: "",
        },
    });
    async function onSubmit(values) {
        mutate({
            username: values.email,
            email: values.email,
            password: values.password,
        }, {
            onError: (error) => {
                const errorMap = {
                    "already taken": t("errors.emailUsernameTaken"),
                };
                let errorMessage = t("errors.unexpectedError");
                if (error instanceof Error) {
                    const errorKey = Object.keys(errorMap).find((key) => error.message?.includes(key));
                    errorMessage = errorKey ? errorMap[errorKey] : errorMessage;
                }
                toast({
                    variant: "destructive",
                    description: errorMessage,
                });
            },
        });
    }
    if (isSuccess) {
        // This message is relevant if system requires email verification
        // If user is `confirmed` immediately, this message is not needed
        // and user should be redirected to sign in page
        return (<card_1.Card className="m-auto w-[400px]">
        <card_1.CardHeader>
          <h2 className="mx-auto">
            {ENABLE_EMAIL_CONFIRMATION ? t("checkEmail") : t("status.success")}
          </h2>
        </card_1.CardHeader>
        <card_1.CardContent>
          <navigation_1.Link href="/auth/signin" className={(0, utils_1.cn)((0, button_1.buttonVariants)({ variant: "default" }), "h-[44px] w-full")}>
            <p>{t("signInLink")}</p>
          </navigation_1.Link>
        </card_1.CardContent>
      </card_1.Card>);
    }
    return (<div className="flex flex-col gap-5">
      <card_1.Card className="m-auto w-[400px]">
        <card_1.CardHeader>
          <card_1.CardTitle>{t("header")}</card_1.CardTitle>
          <card_1.CardDescription>{t("description")}</card_1.CardDescription>
        </card_1.CardHeader>
        <card_1.CardContent>
          <AppForm_1.AppForm form={form} onSubmit={onSubmit} id={registerFormName}>
            <AppField_1.AppField name="email" type="text" required label={t("email")}/>
            <AppField_1.AppField name="password" type="password" required label={t("password")}/>
            <AppField_1.AppField name="passwordConfirmation" type="password" required label={t("checkPassword")}/>
          </AppForm_1.AppForm>
        </card_1.CardContent>
        <card_1.CardFooter className="flex flex-col items-center gap-2">
          <button_1.Button type="submit" size="lg" variant="default" form={registerFormName} className="w-full">
            {t("submit")}
          </button_1.Button>
        </card_1.CardFooter>
      </card_1.Card>

      <p className="mx-auto flex gap-1">
        {t("signInLinkLinkDescription")}
        <span>
          <navigation_1.Link href="/auth/signin" className="underline">
            {t("signInLink")}.
          </navigation_1.Link>
        </span>
      </p>
    </div>);
}
exports.RegisterForm = RegisterForm;
const RegisterFormSchema = z
    .object({
    email: z.string().email(),
    password: z.string().min(constants_1.PASSWORD_MIN_LENGTH),
    passwordConfirmation: z.string().min(constants_1.PASSWORD_MIN_LENGTH),
})
    .superRefine((data, ctx) => {
    if (data.password !== data.passwordConfirmation) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            params: { type: "checkPassword" },
            path: ["passwordConfirmation"],
        });
    }
});
const registerFormName = "registerForm";
