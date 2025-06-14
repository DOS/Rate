"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const link_1 = __importDefault(require("next/link"));
const Button_1 = require("@/components/Button");
const Fields_1 = require("@/components/Fields");
const Logo_1 = require("@/components/Logo");
const SlimLayout_1 = require("@/components/SlimLayout");
exports.metadata = {
    title: 'Sign In',
};
function Login() {
    return (<SlimLayout_1.SlimLayout>
      <div className="flex">
        <link_1.default href="/" aria-label="Home">
          <Logo_1.Logo className="h-10 w-auto"/>
        </link_1.default>
      </div>
      <h2 className="mt-20 text-lg font-semibold text-gray-900">
        Sign in to your account
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        Don’t have an account?{' '}
        <link_1.default href="/register" className="font-medium text-blue-600 hover:underline">
          Sign up
        </link_1.default>{' '}
        for a free trial.
      </p>
      <form action="#" className="mt-10 grid grid-cols-1 gap-y-8">
        <Fields_1.TextField label="Email address" name="email" type="email" autoComplete="email" required/>
        <Fields_1.TextField label="Password" name="password" type="password" autoComplete="current-password" required/>
        <div>
          <Button_1.Button type="submit" variant="solid" color="blue" className="w-full">
            <span>
              Sign in <span aria-hidden="true">&rarr;</span>
            </span>
          </Button_1.Button>
        </div>
      </form>
    </SlimLayout_1.SlimLayout>);
}
exports.default = Login;
