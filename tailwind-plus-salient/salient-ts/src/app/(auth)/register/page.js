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
    title: 'Sign Up',
};
function Register() {
    return (<SlimLayout_1.SlimLayout>
      <div className="flex">
        <link_1.default href="/" aria-label="Home">
          <Logo_1.Logo className="h-10 w-auto"/>
        </link_1.default>
      </div>
      <h2 className="mt-20 text-lg font-semibold text-gray-900">
        Get started for free
      </h2>
      <p className="mt-2 text-sm text-gray-700">
        Already registered?{' '}
        <link_1.default href="/login" className="font-medium text-blue-600 hover:underline">
          Sign in
        </link_1.default>{' '}
        to your account.
      </p>
      <form action="#" className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
        <Fields_1.TextField label="First name" name="first_name" type="text" autoComplete="given-name" required/>
        <Fields_1.TextField label="Last name" name="last_name" type="text" autoComplete="family-name" required/>
        <Fields_1.TextField className="col-span-full" label="Email address" name="email" type="email" autoComplete="email" required/>
        <Fields_1.TextField className="col-span-full" label="Password" name="password" type="password" autoComplete="new-password" required/>
        <Fields_1.SelectField className="col-span-full" label="How did you hear about us?" name="referral_source">
          <option>AltaVista search</option>
          <option>Super Bowl commercial</option>
          <option>Our route 34 city bus ad</option>
          <option>The “Never Use This” podcast</option>
        </Fields_1.SelectField>
        <div className="col-span-full">
          <Button_1.Button type="submit" variant="solid" color="blue" className="w-full">
            <span>
              Sign up <span aria-hidden="true">&rarr;</span>
            </span>
          </Button_1.Button>
        </div>
      </form>
    </SlimLayout_1.SlimLayout>);
}
exports.default = Register;
