"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const link_1 = __importDefault(require("next/link"));
const Button_1 = require("@/components/Button");
const Logo_1 = require("@/components/Logo");
const SlimLayout_1 = require("@/components/SlimLayout");
function NotFound() {
    return (<SlimLayout_1.SlimLayout>
      <div className="flex">
        <link_1.default href="/" aria-label="Home">
          <Logo_1.Logo className="h-10 w-auto"/>
        </link_1.default>
      </div>
      <p className="mt-20 text-sm font-medium text-gray-700">404</p>
      <h1 className="mt-3 text-lg font-semibold text-gray-900">
        Page not found
      </h1>
      <p className="mt-3 text-sm text-gray-700">
        Sorry, we couldn’t find the page you’re looking for.
      </p>
      <Button_1.Button href="/" className="mt-10">
        Go back home
      </Button_1.Button>
    </SlimLayout_1.SlimLayout>);
}
exports.default = NotFound;
