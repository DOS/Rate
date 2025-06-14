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
exports.ForgotPasswordForm = void 0;
const zod_1 = require("@hookform/resolvers/zod");
const react_query_1 = require("@tanstack/react-query");
const next_intl_1 = require("next-intl");
const react_hook_form_1 = require("react-hook-form");
const z = __importStar(require("zod"));
const navigation_1 = require("@/lib/navigation");
const strapi_api_1 = require("@/lib/strapi-api");
const AppField_1 = require("@/components/forms/AppField");
const AppForm_1 = require("@/components/forms/AppForm");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const use_toast_1 = require("@/components/ui/use-toast");
function ForgotPasswordForm() {
    const t = (0, next_intl_1.useTranslations)("auth.forgotPassword");
    const router = (0, navigation_1.useRouter)();
    const { toast } = (0, use_toast_1.useToast)();
    const { mutate } = (0, react_query_1.useMutation)({
        mutationFn: (values) => {
            return strapi_api_1.PrivateStrapiClient.fetchAPI(`/auth/forgot-password`, undefined, {
                body: JSON.stringify(values),
                method: "POST",
                next: { revalidate: 0 },
            }, { omitUserAuthorization: true });
        },
    });
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(ForgotPasswordFormSchema),
        mode: "onBlur",
        reValidateMode: "onBlur",
        defaultValues: { email: "" },
    });
    const onSubmit = (data) => mutate(data, {
        onSuccess: () => {
            toast({
                variant: "default",
                description: t("passwordChangeEmailSent"),
            });
            form.reset();
            router.push("/auth/signin");
        },
    });
    return (<card_1.Card className="m-auto w-[400px]">
      <card_1.CardHeader>
        <card_1.CardTitle>{t("header")}</card_1.CardTitle>
        <card_1.CardDescription>{t("description")}</card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <AppForm_1.AppForm form={form} onSubmit={onSubmit} id={forgotPasswordFormName}>
          <AppField_1.AppField name="email" type="email" required label={t("email")}/>
        </AppForm_1.AppForm>
      </card_1.CardContent>
      <card_1.CardFooter>
        <button_1.Button type="submit" size="lg" variant="default" form={forgotPasswordFormName}>
          {t("submit")}
        </button_1.Button>
      </card_1.CardFooter>
    </card_1.Card>);
}
exports.ForgotPasswordForm = ForgotPasswordForm;
const ForgotPasswordFormSchema = z.object({
    email: z.string().min(1).email(),
});
const forgotPasswordFormName = "forgottenPasswordForm";
