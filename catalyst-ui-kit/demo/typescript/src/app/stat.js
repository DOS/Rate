"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Stat = void 0;
const badge_1 = require("@/components/badge");
const divider_1 = require("@/components/divider");
function Stat({ title, value, change }) {
    return (<div>
      <divider_1.Divider />
      <div className="mt-6 text-lg/6 font-medium sm:text-sm/6">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold sm:text-2xl/8">{value}</div>
      <div className="mt-3 text-sm/6 sm:text-xs/6">
        <badge_1.Badge color={change.startsWith('+') ? 'lime' : 'pink'}>{change}</badge_1.Badge>{' '}
        <span className="text-zinc-500">from last week</span>
      </div>
    </div>);
}
exports.Stat = Stat;
