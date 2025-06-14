"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TailwindIndicator = void 0;
const general_helpers_1 = require("@/lib/general-helpers");
function TailwindIndicator() {
    if ((0, general_helpers_1.isDevelopment)()) {
        return (<div className="fixed bottom-1 left-1 z-50 flex size-6 items-center justify-center rounded-full bg-gray-800 p-3 font-mono text-xs text-white">
        <div className="block sm:hidden">xs</div>
        <div className="hidden sm:block md:hidden">sm</div>
        <div className="hidden md:block lg:hidden">md</div>
        <div className="hidden lg:block xl:hidden">lg</div>
        <div className="hidden xl:block 2xl:hidden">xl</div>
        <div className="hidden 2xl:block">2xl</div>
      </div>);
    }
    return null;
}
exports.TailwindIndicator = TailwindIndicator;
