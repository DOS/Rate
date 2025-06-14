"use client";
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const react_2 = require("next-auth/react");
const next_intl_1 = require("next-intl");
const general_helpers_1 = require("@/lib/general-helpers");
const navigation_1 = require("@/lib/navigation");
function SignOutPage() {
    (0, general_helpers_1.removeThisWhenYouNeedMe)("SignOutPage");
    const session = (0, react_2.useSession)();
    const locale = (0, next_intl_1.useLocale)();
    (0, react_1.useEffect)(() => {
        if (session.status === "authenticated") {
            (0, react_2.signOut)({ callbackUrl: "/" });
        }
        else {
            (0, navigation_1.redirect)({ href: "/", locale });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session.status]);
    return null;
}
exports.default = SignOutPage;
