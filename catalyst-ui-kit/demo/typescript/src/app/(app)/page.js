"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stat_1 = require("@/app/stat");
const avatar_1 = require("@/components/avatar");
const heading_1 = require("@/components/heading");
const select_1 = require("@/components/select");
const table_1 = require("@/components/table");
const data_1 = require("@/data");
async function Home() {
    let orders = await (0, data_1.getRecentOrders)();
    return (<>
      <heading_1.Heading>Good afternoon, Erica</heading_1.Heading>
      <div className="mt-8 flex items-end justify-between">
        <heading_1.Subheading>Overview</heading_1.Subheading>
        <div>
          <select_1.Select name="period">
            <option value="last_week">Last week</option>
            <option value="last_two">Last two weeks</option>
            <option value="last_month">Last month</option>
            <option value="last_quarter">Last quarter</option>
          </select_1.Select>
        </div>
      </div>
      <div className="mt-4 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <stat_1.Stat title="Total revenue" value="$2.6M" change="+4.5%"/>
        <stat_1.Stat title="Average order value" value="$455" change="-0.5%"/>
        <stat_1.Stat title="Tickets sold" value="5,888" change="+4.5%"/>
        <stat_1.Stat title="Pageviews" value="823,067" change="+21.2%"/>
      </div>
      <heading_1.Subheading className="mt-14">Recent orders</heading_1.Subheading>
      <table_1.Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <table_1.TableHead>
          <table_1.TableRow>
            <table_1.TableHeader>Order number</table_1.TableHeader>
            <table_1.TableHeader>Purchase date</table_1.TableHeader>
            <table_1.TableHeader>Customer</table_1.TableHeader>
            <table_1.TableHeader>Event</table_1.TableHeader>
            <table_1.TableHeader className="text-right">Amount</table_1.TableHeader>
          </table_1.TableRow>
        </table_1.TableHead>
        <table_1.TableBody>
          {orders.map((order) => (<table_1.TableRow key={order.id} href={order.url} title={`Order #${order.id}`}>
              <table_1.TableCell>{order.id}</table_1.TableCell>
              <table_1.TableCell className="text-zinc-500">{order.date}</table_1.TableCell>
              <table_1.TableCell>{order.customer.name}</table_1.TableCell>
              <table_1.TableCell>
                <div className="flex items-center gap-2">
                  <avatar_1.Avatar src={order.event.thumbUrl} className="size-6"/>
                  <span>{order.event.name}</span>
                </div>
              </table_1.TableCell>
              <table_1.TableCell className="text-right">US{order.amount.usd}</table_1.TableCell>
            </table_1.TableRow>))}
        </table_1.TableBody>
      </table_1.Table>
    </>);
}
exports.default = Home;
