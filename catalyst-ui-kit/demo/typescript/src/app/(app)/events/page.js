"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const badge_1 = require("@/components/badge");
const button_1 = require("@/components/button");
const divider_1 = require("@/components/divider");
const dropdown_1 = require("@/components/dropdown");
const heading_1 = require("@/components/heading");
const input_1 = require("@/components/input");
const link_1 = require("@/components/link");
const select_1 = require("@/components/select");
const data_1 = require("@/data");
const solid_1 = require("@heroicons/react/16/solid");
exports.metadata = {
    title: 'Events',
};
async function Events() {
    let events = await (0, data_1.getEvents)();
    return (<>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-sm:w-full sm:flex-1">
          <heading_1.Heading>Events</heading_1.Heading>
          <div className="mt-4 flex max-w-xl gap-4">
            <div className="flex-1">
              <input_1.InputGroup>
                <solid_1.MagnifyingGlassIcon />
                <input_1.Input name="search" placeholder="Search events&hellip;"/>
              </input_1.InputGroup>
            </div>
            <div>
              <select_1.Select name="sort_by">
                <option value="name">Sort by name</option>
                <option value="date">Sort by date</option>
                <option value="status">Sort by status</option>
              </select_1.Select>
            </div>
          </div>
        </div>
        <button_1.Button>Create event</button_1.Button>
      </div>
      <ul className="mt-10">
        {events.map((event, index) => (<li key={event.id}>
            <divider_1.Divider soft={index > 0}/>
            <div className="flex items-center justify-between">
              <div key={event.id} className="flex gap-6 py-6">
                <div className="w-32 shrink-0">
                  <link_1.Link href={event.url} aria-hidden="true">
                    <img className="aspect-3/2 rounded-lg shadow-sm" src={event.imgUrl} alt=""/>
                  </link_1.Link>
                </div>
                <div className="space-y-1.5">
                  <div className="text-base/6 font-semibold">
                    <link_1.Link href={event.url}>{event.name}</link_1.Link>
                  </div>
                  <div className="text-xs/6 text-zinc-500">
                    {event.date} at {event.time} <span aria-hidden="true">·</span> {event.location}
                  </div>
                  <div className="text-xs/6 text-zinc-600">
                    {event.ticketsSold}/{event.ticketsAvailable} tickets sold
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <badge_1.Badge className="max-sm:hidden" color={event.status === 'On Sale' ? 'lime' : 'zinc'}>
                  {event.status}
                </badge_1.Badge>
                <dropdown_1.Dropdown>
                  <dropdown_1.DropdownButton plain aria-label="More options">
                    <solid_1.EllipsisVerticalIcon />
                  </dropdown_1.DropdownButton>
                  <dropdown_1.DropdownMenu anchor="bottom end">
                    <dropdown_1.DropdownItem href={event.url}>View</dropdown_1.DropdownItem>
                    <dropdown_1.DropdownItem>Edit</dropdown_1.DropdownItem>
                    <dropdown_1.DropdownItem>Delete</dropdown_1.DropdownItem>
                  </dropdown_1.DropdownMenu>
                </dropdown_1.Dropdown>
              </div>
            </div>
          </li>))}
      </ul>
    </>);
}
exports.default = Events;
