"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("next-intl/server");
const auth_1 = require("@/lib/auth");
const navigation_1 = require("@/lib/navigation");
const button_1 = require("@/components/ui/button");
const card_1 = require("@/components/ui/card");
async function AuthPage({ params }) {
    const session = await (0, auth_1.getAuth)();
    const { locale } = await params;
    (0, server_1.setRequestLocale)(locale);
    return (<div className="space-y-10">
      {session && (<card_1.Card className="m-auto w-[800px]">
          <card_1.CardHeader>
            <card_1.CardTitle>Authenticated content</card_1.CardTitle>
            <card_1.CardDescription>
              This is available only for authenticated users.
            </card_1.CardDescription>
          </card_1.CardHeader>
          <card_1.CardContent className="space-y-2">
            <strong>Session: </strong> {JSON.stringify(session.user)}
          </card_1.CardContent>
          <card_1.CardFooter className="flex w-full items-center justify-end gap-3">
            <button_1.Button asChild>
              <navigation_1.Link href="/profile">Profile page</navigation_1.Link>
            </button_1.Button>
            <button_1.Button asChild>
              <navigation_1.Link href="/auth/change-password">Change password</navigation_1.Link>
            </button_1.Button>
            <button_1.Button asChild>
              <navigation_1.Link href="/auth/signout">Logout</navigation_1.Link>
            </button_1.Button>
          </card_1.CardFooter>
        </card_1.Card>)}
    </div>);
}
exports.default = AuthPage;
