"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const logo_1 = require("@/app/logo");
const button_1 = require("@/components/button");
const fieldset_1 = require("@/components/fieldset");
const heading_1 = require("@/components/heading");
const input_1 = require("@/components/input");
const text_1 = require("@/components/text");
exports.metadata = {
    title: 'Forgot password',
};
function Login() {
    return (<form action="" method="POST" className="grid w-full max-w-sm grid-cols-1 gap-8">
      <logo_1.Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]"/>
      <heading_1.Heading>Reset your password</heading_1.Heading>
      <text_1.Text>Enter your email and we’ll send you a link to reset your password.</text_1.Text>
      <fieldset_1.Field>
        <fieldset_1.Label>Email</fieldset_1.Label>
        <input_1.Input type="email" name="email"/>
      </fieldset_1.Field>
      <button_1.Button type="submit" className="w-full">
        Reset password
      </button_1.Button>
      <text_1.Text>
        Don’t have an account?{' '}
        <text_1.TextLink href="/register">
          <text_1.Strong>Sign up</text_1.Strong>
        </text_1.TextLink>
      </text_1.Text>
    </form>);
}
exports.default = Login;
