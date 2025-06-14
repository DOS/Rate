"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMetadata = void 0;
const stat_1 = require("@/app/stat");
const badge_1 = require("@/components/badge");
const button_1 = require("@/components/button");
const heading_1 = require("@/components/heading");
const link_1 = require("@/components/link");
const table_1 = require("@/components/table");
const data_1 = require("@/data");
const solid_1 = require("@heroicons/react/16/solid");
const navigation_1 = require("next/navigation");
async function generateMetadata({ params }) {
    let event = await (0, data_1.getEvent)(params.id);
    return {
        title: event?.name,
    };
}
exports.generateMetadata = generateMetadata;
async function Event({ params }) {
    let event = await (0, data_1.getEvent)(params.id);
    let orders = await (0, data_1.getEventOrders)(params.id);
    if (!event) {
        (0, navigation_1.notFound)();
    }
    return (<>
      <div className="max-lg:hidden">
        <link_1.Link href="/events" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <solid_1.ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500"/>
          Events
        </link_1.Link>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="w-32 shrink-0">
            <img className="aspect-3/2 rounded-lg shadow-sm" src={event.imgUrl} alt=""/>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <heading_1.Heading>{event.name}</heading_1.Heading>
              <badge_1.Badge color={event.status === 'On Sale' ? 'lime' : 'zinc'}>{event.status}</badge_1.Badge>
            </div>
            <div className="mt-2 text-sm/6 text-zinc-500">
              {event.date} at {event.time} <span aria-hidden="true">·</span> {event.location}
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button_1.Button outline>Edit</button_1.Button>
          <button_1.Button>View</button_1.Button>
        </div>
      </div>
      <div className="mt-8 grid gap-8 sm:grid-cols-3">
        <stat_1.Stat title="Total revenue" value={event.totalRevenue} change={event.totalRevenueChange}/>
        <stat_1.Stat title="Tickets sold" value={`${event.ticketsSold}/${event.ticketsAvailable}`} change={event.ticketsSoldChange}/>
        <stat_1.Stat title="Pageviews" value={event.pageViews} change={event.pageViewsChange}/>
      </div>
      <heading_1.Subheading className="mt-12">Recent orders</heading_1.Subheading>
      <table_1.Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <table_1.TableHead>
          <table_1.TableRow>
            <table_1.TableHeader>Order number</table_1.TableHeader>
            <table_1.TableHeader>Purchase date</table_1.TableHeader>
            <table_1.TableHeader>Customer</table_1.TableHeader>
            <table_1.TableHeader className="text-right">Amount</table_1.TableHeader>
          </table_1.TableRow>
        </table_1.TableHead>
        <table_1.TableBody>
          {orders.map((order) => (<table_1.TableRow key={order.id} href={order.url} title={`Order #${order.id}`}>
              <table_1.TableCell>{order.id}</table_1.TableCell>
              <table_1.TableCell className="text-zinc-500">{order.date}</table_1.TableCell>
              <table_1.TableCell>{order.customer.name}</table_1.TableCell>
              <table_1.TableCell className="text-right">US{order.amount.usd}</table_1.TableCell>
            </table_1.TableRow>))}
        </table_1.TableBody>
      </table_1.Table>
    </>);
}
exports.default = Event;
