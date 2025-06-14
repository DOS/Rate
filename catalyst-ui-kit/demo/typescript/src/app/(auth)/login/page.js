"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const logo_1 = require("@/app/logo");
const button_1 = require("@/components/button");
const checkbox_1 = require("@/components/checkbox");
const fieldset_1 = require("@/components/fieldset");
const heading_1 = require("@/components/heading");
const input_1 = require("@/components/input");
const text_1 = require("@/components/text");
exports.metadata = {
    title: 'Login',
};
function Login() {
    return (<form action="" method="POST" className="grid w-full max-w-sm grid-cols-1 gap-8">
      <logo_1.Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]"/>
      <heading_1.Heading>Sign in to your account</heading_1.Heading>
      <fieldset_1.Field>
        <fieldset_1.Label>Email</fieldset_1.Label>
        <input_1.Input type="email" name="email"/>
      </fieldset_1.Field>
      <fieldset_1.Field>
        <fieldset_1.Label>Password</fieldset_1.Label>
        <input_1.Input type="password" name="password"/>
      </fieldset_1.Field>
      <div className="flex items-center justify-between">
        <checkbox_1.CheckboxField>
          <checkbox_1.Checkbox name="remember"/>
          <fieldset_1.Label>Remember me</fieldset_1.Label>
        </checkbox_1.CheckboxField>
        <text_1.Text>
          <text_1.TextLink href="/forgot-password">
            <text_1.Strong>Forgot password?</text_1.Strong>
          </text_1.TextLink>
        </text_1.Text>
      </div>
      <button_1.Button type="submit" className="w-full">
        Login
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
