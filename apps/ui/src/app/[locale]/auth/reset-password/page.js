"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const general_helpers_1 = require("@/lib/general-helpers");
const SetPasswordForm_1 = require("@/app/[locale]/auth/activate/_components/SetPasswordForm");
function ResetPasswordPage() {
    (0, general_helpers_1.removeThisWhenYouNeedMe)("ResetPasswordPage");
    return <SetPasswordForm_1.SetPasswordForm />;
}
exports.default = ResetPasswordPage;
