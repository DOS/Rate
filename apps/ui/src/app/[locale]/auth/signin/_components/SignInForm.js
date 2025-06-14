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
exports.SignInForm = void 0;
const navigation_1 = require("next/navigation");
const zod_1 = require("@hookform/resolvers/zod");
const react_1 = require("next-auth/react");
const next_intl_1 = require("next-intl");
const react_hook_form_1 = require("react-hook-form");
const z = __importStar(require("zod"));
const general_helpers_1 = require("@/lib/general-helpers");
const navigation_2 = require("@/lib/navigation");
const AppField_1 = require("@/components/forms/AppField");
const AppForm_1 = require("@/components/forms/AppForm");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
const use_toast_1 = require("@/components/ui/use-toast");
function SignInForm() {
    const t = (0, next_intl_1.useTranslations)("auth.signIn");
    const { toast } = (0, use_toast_1.useToast)();
    const router = (0, navigation_2.useRouter)();
    const searchParams = (0, navigation_1.useSearchParams)();
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(SignInFormSchema),
        mode: "onBlur",
        reValidateMode: "onBlur",
        defaultValues: { email: "", password: "" },
    });
    async function onSubmit(values) {
        const res = await (0, react_1.signIn)("credentials", {
            ...values,
            callbackUrl,
            redirect: false,
        });
        if (!res?.error) {
            router.refresh();
            setTimeout(() => router.push(callbackUrl), 300);
        }
        else {
            const parsedError = (0, general_helpers_1.safeJSONParse)(res.error);
            const message = "message" in parsedError
                ? parsedError.message
                : t("errors.CredentialsSignin");
            toast({
                variant: "destructive",
                description: message,
            });
        }
    }
    return (<card_1.Card className="m-auto w-[400px]">
      <card_1.CardHeader>
        <card_1.CardTitle>{t("header")}</card_1.CardTitle>
        <card_1.CardDescription>{t("description")}</card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <AppForm_1.AppForm form={form} onSubmit={onSubmit} id={signInFormName}>
          <AppField_1.AppField name="email" type="text" autoComplete="email" required label={t("email")}/>
          <AppField_1.AppField name="password" type="password" 
    // https://www.chromium.org/developers/design-documents/create-amazing-password-forms/
    autoComplete="current-password" required label={t("password")}/>
        </AppForm_1.AppForm>
      </card_1.CardContent>
      <card_1.CardFooter className="flex flex-col items-center gap-2">
        <button_1.Button type="submit" size="lg" variant="default" form={signInFormName}>
          {t("submit")}
        </button_1.Button>

        <div className="mt-2">
          <button_1.Button asChild variant="ghost" size="sm">
            <navigation_2.Link href="/auth/forgot-password">{t("forgotPassword")}?</navigation_2.Link>
          </button_1.Button>

          <button_1.Button asChild variant="ghost" size="sm">
            <navigation_2.Link href="/auth/register">{t("createAccount")}</navigation_2.Link>
          </button_1.Button>
        </div>
      </card_1.CardFooter>
    </card_1.Card>);
}
exports.SignInForm = SignInForm;
const SignInFormSchema = z.object({
    email: z.string().min(1).email().or(z.string().min(1)),
    password: z.string().min(1),
});
const signInFormName = "signInForm";
