"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const next_intl_1 = require("next-intl");
const general_helpers_1 = require("@/lib/general-helpers");
const alert_1 = require("@/components/ui/alert");
const button_1 = require("@/components/ui/button");
const SetPasswordForm_1 = require("./_components/SetPasswordForm");
function ActivateAccountPage() {
    (0, general_helpers_1.removeThisWhenYouNeedMe)("ActivateAccountPage");
    const t = (0, next_intl_1.useTranslations)("auth.accountActivation");
    const [formToggled, setFormToggled] = (0, react_1.useState)(false);
    const params = (0, navigation_1.useSearchParams)();
    const code = params.get("code");
    const name = params.get("name");
    const email = params.get("email");
    const title = [t("welcome"), name].join(", ");
    if (formToggled) {
        return <SetPasswordForm_1.SetPasswordForm accountActivation/>;
    }
    return (<div className="flex w-full flex-col items-center justify-center gap-12">
      {code != null ? (<div>
          <h4 className="text-2xl">{title}!</h4>
          <p className="mb-4 text-base">{t("activateAccount", { email })}</p>
          <button_1.Button variant="default" onClick={() => setFormToggled(true)}>
            {t("activate")}
          </button_1.Button>
        </div>) : (<div>
          <alert_1.Alert variant="destructive">{t("invalidLink")}</alert_1.Alert>
        </div>)}
    </div>);
}
exports.default = ActivateAccountPage;
