"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMetadata = void 0;
const avatar_1 = require("@/components/avatar");
const badge_1 = require("@/components/badge");
const button_1 = require("@/components/button");
const description_list_1 = require("@/components/description-list");
const divider_1 = require("@/components/divider");
const heading_1 = require("@/components/heading");
const link_1 = require("@/components/link");
const data_1 = require("@/data");
const solid_1 = require("@heroicons/react/16/solid");
const navigation_1 = require("next/navigation");
const refund_1 = require("./refund");
async function generateMetadata({ params }) {
    let order = await (0, data_1.getOrder)(params.id);
    return {
        title: order && `Order #${order.id}`,
    };
}
exports.generateMetadata = generateMetadata;
async function Order({ params }) {
    let order = await (0, data_1.getOrder)(params.id);
    if (!order) {
        (0, navigation_1.notFound)();
    }
    return (<>
      <div className="max-lg:hidden">
        <link_1.Link href="/orders" className="inline-flex items-center gap-2 text-sm/6 text-zinc-500 dark:text-zinc-400">
          <solid_1.ChevronLeftIcon className="size-4 fill-zinc-400 dark:fill-zinc-500"/>
          Orders
        </link_1.Link>
      </div>
      <div className="mt-4 lg:mt-8">
        <div className="flex items-center gap-4">
          <heading_1.Heading>Order #{order.id}</heading_1.Heading>
          <badge_1.Badge color="lime">Successful</badge_1.Badge>
        </div>
        <div className="isolate mt-2.5 flex flex-wrap justify-between gap-x-6 gap-y-4">
          <div className="flex flex-wrap gap-x-10 gap-y-4 py-1.5">
            <span className="flex items-center gap-3 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
              <solid_1.BanknotesIcon className="size-4 shrink-0 fill-zinc-400 dark:fill-zinc-500"/>
              <span>US{order.amount.usd}</span>
            </span>
            <span className="flex items-center gap-3 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
              <solid_1.CreditCardIcon className="size-4 shrink-0 fill-zinc-400 dark:fill-zinc-500"/>
              <span className="inline-flex gap-3">
                {order.payment.card.type}{' '}
                <span>
                  <span aria-hidden="true">••••</span> {order.payment.card.number}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-3 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white">
              <solid_1.CalendarIcon className="size-4 shrink-0 fill-zinc-400 dark:fill-zinc-500"/>
              <span>{order.date}</span>
            </span>
          </div>
          <div className="flex gap-4">
            <refund_1.RefundOrder outline amount={order.amount.usd}>
              Refund
            </refund_1.RefundOrder>
            <button_1.Button>Resend Invoice</button_1.Button>
          </div>
        </div>
      </div>
      <div className="mt-12">
        <heading_1.Subheading>Summary</heading_1.Subheading>
        <divider_1.Divider className="mt-4"/>
        <description_list_1.DescriptionList>
          <description_list_1.DescriptionTerm>Customer</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.customer.name}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Event</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>
            <link_1.Link href={order.event.url} className="flex items-center gap-2">
              <avatar_1.Avatar src={order.event.thumbUrl} className="size-6"/>
              <span>{order.event.name}</span>
            </link_1.Link>
          </description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Amount</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>US{order.amount.usd}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Amount after exchange rate</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>
            US{order.amount.usd} &rarr; CA{order.amount.cad}
          </description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Fee</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>CA{order.amount.fee}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Net</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>CA{order.amount.net}</description_list_1.DescriptionDetails>
        </description_list_1.DescriptionList>
      </div>
      <div className="mt-12">
        <heading_1.Subheading>Payment method</heading_1.Subheading>
        <divider_1.Divider className="mt-4"/>
        <description_list_1.DescriptionList>
          <description_list_1.DescriptionTerm>Transaction ID</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.payment.transactionId}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Card number</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>•••• {order.payment.card.number}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Card type</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.payment.card.type}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Card expiry</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.payment.card.expiry}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Owner</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.customer.name}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Email address</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.customer.email}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Address</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>{order.customer.address}</description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>Country</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>
            <span className="inline-flex gap-3">
              <img src={order.customer.countryFlagUrl} alt={order.customer.country}/>
              {order.customer.country}
            </span>
          </description_list_1.DescriptionDetails>
          <description_list_1.DescriptionTerm>CVC</description_list_1.DescriptionTerm>
          <description_list_1.DescriptionDetails>
            <badge_1.Badge color="lime">Passed successfully</badge_1.Badge>
          </description_list_1.DescriptionDetails>
        </description_list_1.DescriptionList>
      </div>
    </>);
}
exports.default = Order;
