"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Spinner_1 = require("@/components/elementary/Spinner");
function Loading() {
    return (<div className="flex h-screen items-center justify-center">
      <Spinner_1.Spinner className="size-7 border-3 border-black"/>
    </div>);
}
exports.default = Loading;
