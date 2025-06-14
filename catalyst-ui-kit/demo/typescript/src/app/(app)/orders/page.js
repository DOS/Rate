"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const avatar_1 = require("@/components/avatar");
const button_1 = require("@/components/button");
const heading_1 = require("@/components/heading");
const table_1 = require("@/components/table");
const data_1 = require("@/data");
exports.metadata = {
    title: 'Orders',
};
async function Orders() {
    let orders = await (0, data_1.getOrders)();
    return (<>
      <div className="flex items-end justify-between gap-4">
        <heading_1.Heading>Orders</heading_1.Heading>
        <button_1.Button className="-my-0.5">Create order</button_1.Button>
      </div>
      <table_1.Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
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
exports.default = Orders;
