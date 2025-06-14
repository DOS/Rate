'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationLayout = void 0;
const avatar_1 = require("@/components/avatar");
const dropdown_1 = require("@/components/dropdown");
const navbar_1 = require("@/components/navbar");
const sidebar_1 = require("@/components/sidebar");
const sidebar_layout_1 = require("@/components/sidebar-layout");
const solid_1 = require("@heroicons/react/16/solid");
const solid_2 = require("@heroicons/react/20/solid");
const navigation_1 = require("next/navigation");
function AccountDropdownMenu({ anchor }) {
    return (<dropdown_1.DropdownMenu className="min-w-64" anchor={anchor}>
      <dropdown_1.DropdownItem href="#">
        <solid_1.UserCircleIcon />
        <dropdown_1.DropdownLabel>My account</dropdown_1.DropdownLabel>
      </dropdown_1.DropdownItem>
      <dropdown_1.DropdownDivider />
      <dropdown_1.DropdownItem href="#">
        <solid_1.ShieldCheckIcon />
        <dropdown_1.DropdownLabel>Privacy policy</dropdown_1.DropdownLabel>
      </dropdown_1.DropdownItem>
      <dropdown_1.DropdownItem href="#">
        <solid_1.LightBulbIcon />
        <dropdown_1.DropdownLabel>Share feedback</dropdown_1.DropdownLabel>
      </dropdown_1.DropdownItem>
      <dropdown_1.DropdownDivider />
      <dropdown_1.DropdownItem href="/login">
        <solid_1.ArrowRightStartOnRectangleIcon />
        <dropdown_1.DropdownLabel>Sign out</dropdown_1.DropdownLabel>
      </dropdown_1.DropdownItem>
    </dropdown_1.DropdownMenu>);
}
function ApplicationLayout({ events, children, }) {
    let pathname = (0, navigation_1.usePathname)();
    return (<sidebar_layout_1.SidebarLayout navbar={<navbar_1.Navbar>
          <navbar_1.NavbarSpacer />
          <navbar_1.NavbarSection>
            <dropdown_1.Dropdown>
              <dropdown_1.DropdownButton as={navbar_1.NavbarItem}>
                <avatar_1.Avatar src="/users/erica.jpg" square/>
              </dropdown_1.DropdownButton>
              <AccountDropdownMenu anchor="bottom end"/>
            </dropdown_1.Dropdown>
          </navbar_1.NavbarSection>
        </navbar_1.Navbar>} sidebar={<sidebar_1.Sidebar>
          <sidebar_1.SidebarHeader>
            <dropdown_1.Dropdown>
              <dropdown_1.DropdownButton as={sidebar_1.SidebarItem}>
                <avatar_1.Avatar src="/teams/catalyst.svg"/>
                <sidebar_1.SidebarLabel>Catalyst</sidebar_1.SidebarLabel>
                <solid_1.ChevronDownIcon />
              </dropdown_1.DropdownButton>
              <dropdown_1.DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <dropdown_1.DropdownItem href="/settings">
                  <solid_1.Cog8ToothIcon />
                  <dropdown_1.DropdownLabel>Settings</dropdown_1.DropdownLabel>
                </dropdown_1.DropdownItem>
                <dropdown_1.DropdownDivider />
                <dropdown_1.DropdownItem href="#">
                  <avatar_1.Avatar slot="icon" src="/teams/catalyst.svg"/>
                  <dropdown_1.DropdownLabel>Catalyst</dropdown_1.DropdownLabel>
                </dropdown_1.DropdownItem>
                <dropdown_1.DropdownItem href="#">
                  <avatar_1.Avatar slot="icon" initials="BE" className="bg-purple-500 text-white"/>
                  <dropdown_1.DropdownLabel>Big Events</dropdown_1.DropdownLabel>
                </dropdown_1.DropdownItem>
                <dropdown_1.DropdownDivider />
                <dropdown_1.DropdownItem href="#">
                  <solid_1.PlusIcon />
                  <dropdown_1.DropdownLabel>New team&hellip;</dropdown_1.DropdownLabel>
                </dropdown_1.DropdownItem>
              </dropdown_1.DropdownMenu>
            </dropdown_1.Dropdown>
          </sidebar_1.SidebarHeader>

          <sidebar_1.SidebarBody>
            <sidebar_1.SidebarSection>
              <sidebar_1.SidebarItem href="/" current={pathname === '/'}>
                <solid_2.HomeIcon />
                <sidebar_1.SidebarLabel>Home</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
              <sidebar_1.SidebarItem href="/events" current={pathname.startsWith('/events')}>
                <solid_2.Square2StackIcon />
                <sidebar_1.SidebarLabel>Events</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
              <sidebar_1.SidebarItem href="/orders" current={pathname.startsWith('/orders')}>
                <solid_2.TicketIcon />
                <sidebar_1.SidebarLabel>Orders</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
              <sidebar_1.SidebarItem href="/settings" current={pathname.startsWith('/settings')}>
                <solid_2.Cog6ToothIcon />
                <sidebar_1.SidebarLabel>Settings</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
            </sidebar_1.SidebarSection>

            <sidebar_1.SidebarSection className="max-lg:hidden">
              <sidebar_1.SidebarHeading>Upcoming Events</sidebar_1.SidebarHeading>
              {events.map((event) => (<sidebar_1.SidebarItem key={event.id} href={event.url}>
                  {event.name}
                </sidebar_1.SidebarItem>))}
            </sidebar_1.SidebarSection>

            <sidebar_1.SidebarSpacer />

            <sidebar_1.SidebarSection>
              <sidebar_1.SidebarItem href="#">
                <solid_2.QuestionMarkCircleIcon />
                <sidebar_1.SidebarLabel>Support</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
              <sidebar_1.SidebarItem href="#">
                <solid_2.SparklesIcon />
                <sidebar_1.SidebarLabel>Changelog</sidebar_1.SidebarLabel>
              </sidebar_1.SidebarItem>
            </sidebar_1.SidebarSection>
          </sidebar_1.SidebarBody>

          <sidebar_1.SidebarFooter className="max-lg:hidden">
            <dropdown_1.Dropdown>
              <dropdown_1.DropdownButton as={sidebar_1.SidebarItem}>
                <span className="flex min-w-0 items-center gap-3">
                  <avatar_1.Avatar src="/users/erica.jpg" className="size-10" square alt=""/>
                  <span className="min-w-0">
                    <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">Erica</span>
                    <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                      erica@example.com
                    </span>
                  </span>
                </span>
                <solid_1.ChevronUpIcon />
              </dropdown_1.DropdownButton>
              <AccountDropdownMenu anchor="top start"/>
            </dropdown_1.Dropdown>
          </sidebar_1.SidebarFooter>
        </sidebar_1.Sidebar>}>
      {children}
    </sidebar_layout_1.SidebarLayout>);
}
exports.ApplicationLayout = ApplicationLayout;
