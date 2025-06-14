"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggedUserMenu = void 0;
const lucide_react_1 = require("lucide-react");
const next_intl_1 = require("next-intl");
const navigation_1 = require("@/lib/navigation");
const button_1 = require("@/components/ui/button");
const dropdown_menu_1 = require("@/components/ui/dropdown-menu");
function LoggedUserMenu({ user }) {
    const t = (0, next_intl_1.useTranslations)("navbar");
    return (<dropdown_menu_1.DropdownMenu>
      <dropdown_menu_1.DropdownMenuTrigger asChild>
        <button_1.Button variant="outline">
          <lucide_react_1.User className="mr-2 size-4"/>
          {user.email}
        </button_1.Button>
      </dropdown_menu_1.DropdownMenuTrigger>
      <dropdown_menu_1.DropdownMenuContent className="w-56">
        <dropdown_menu_1.DropdownMenuLabel>{t("account")}</dropdown_menu_1.DropdownMenuLabel>
        <dropdown_menu_1.DropdownMenuSeparator />

        <dropdown_menu_1.DropdownMenuItem>
          <navigation_1.Link href="/auth/change-password" className="flex w-full items-center gap-1">
            <lucide_react_1.UserRoundCogIcon className="mr-2 size-4"/>
            <span>{t("actions.changePassword")}</span>
          </navigation_1.Link>
        </dropdown_menu_1.DropdownMenuItem>

        <dropdown_menu_1.DropdownMenuItem>
          <navigation_1.Link href="/auth/signout" className="flex w-full items-center gap-1">
            <lucide_react_1.LogOutIcon className="mr-2 size-4"/>
            <span>{t("actions.signOut")}</span>
          </navigation_1.Link>
        </dropdown_menu_1.DropdownMenuItem>
      </dropdown_menu_1.DropdownMenuContent>
    </dropdown_menu_1.DropdownMenu>);
}
exports.LoggedUserMenu = LoggedUserMenu;
