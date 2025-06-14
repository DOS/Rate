"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const logo_1 = require("@/app/logo");
const button_1 = require("@/components/button");
const checkbox_1 = require("@/components/checkbox");
const fieldset_1 = require("@/components/fieldset");
const heading_1 = require("@/components/heading");
const input_1 = require("@/components/input");
const select_1 = require("@/components/select");
const text_1 = require("@/components/text");
exports.metadata = {
    title: 'Register',
};
function Login() {
    return (<form action="" method="POST" className="grid w-full max-w-sm grid-cols-1 gap-8">
      <logo_1.Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]"/>
      <heading_1.Heading>Create your account</heading_1.Heading>
      <fieldset_1.Field>
        <fieldset_1.Label>Email</fieldset_1.Label>
        <input_1.Input type="email" name="email"/>
      </fieldset_1.Field>
      <fieldset_1.Field>
        <fieldset_1.Label>Full name</fieldset_1.Label>
        <input_1.Input name="name"/>
      </fieldset_1.Field>
      <fieldset_1.Field>
        <fieldset_1.Label>Password</fieldset_1.Label>
        <input_1.Input type="password" name="password" autoComplete="new-password"/>
      </fieldset_1.Field>
      <fieldset_1.Field>
        <fieldset_1.Label>Country</fieldset_1.Label>
        <select_1.Select name="country">
          <option>Canada</option>
          <option>Mexico</option>
          <option>United States</option>
        </select_1.Select>
      </fieldset_1.Field>
      <checkbox_1.CheckboxField>
        <checkbox_1.Checkbox name="remember"/>
        <fieldset_1.Label>Get emails about product updates and news.</fieldset_1.Label>
      </checkbox_1.CheckboxField>
      <button_1.Button type="submit" className="w-full">
        Create account
      </button_1.Button>
      <text_1.Text>
        Already have an account?{' '}
        <text_1.TextLink href="/login">
          <text_1.Strong>Sign in</text_1.Strong>
        </text_1.TextLink>
      </text_1.Text>
    </form>);
}
exports.default = Login;
