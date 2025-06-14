"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const button_1 = require("@/components/button");
const checkbox_1 = require("@/components/checkbox");
const divider_1 = require("@/components/divider");
const fieldset_1 = require("@/components/fieldset");
const heading_1 = require("@/components/heading");
const input_1 = require("@/components/input");
const select_1 = require("@/components/select");
const text_1 = require("@/components/text");
const textarea_1 = require("@/components/textarea");
const address_1 = require("./address");
exports.metadata = {
    title: 'Settings',
};
function Settings() {
    return (<form method="post" className="mx-auto max-w-4xl">
      <heading_1.Heading>Settings</heading_1.Heading>
      <divider_1.Divider className="my-10 mt-6"/>

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <heading_1.Subheading>Organization Name</heading_1.Subheading>
          <text_1.Text>This will be displayed on your public profile.</text_1.Text>
        </div>
        <div>
          <input_1.Input aria-label="Organization Name" name="name" defaultValue="Catalyst"/>
        </div>
      </section>

      <divider_1.Divider className="my-10" soft/>

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <heading_1.Subheading>Organization Bio</heading_1.Subheading>
          <text_1.Text>This will be displayed on your public profile. Maximum 240 characters.</text_1.Text>
        </div>
        <div>
          <textarea_1.Textarea aria-label="Organization Bio" name="bio"/>
        </div>
      </section>

      <divider_1.Divider className="my-10" soft/>

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <heading_1.Subheading>Organization Email</heading_1.Subheading>
          <text_1.Text>This is how customers can contact you for support.</text_1.Text>
        </div>
        <div className="space-y-4">
          <input_1.Input type="email" aria-label="Organization Email" name="email" defaultValue="info@example.com"/>
          <checkbox_1.CheckboxField>
            <checkbox_1.Checkbox name="email_is_public" defaultChecked/>
            <fieldset_1.Label>Show email on public profile</fieldset_1.Label>
          </checkbox_1.CheckboxField>
        </div>
      </section>

      <divider_1.Divider className="my-10" soft/>

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <heading_1.Subheading>Address</heading_1.Subheading>
          <text_1.Text>This is where your organization is registered.</text_1.Text>
        </div>
        <address_1.Address />
      </section>

      <divider_1.Divider className="my-10" soft/>

      <section className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <div className="space-y-1">
          <heading_1.Subheading>Currency</heading_1.Subheading>
          <text_1.Text>The currency that your organization will be collecting.</text_1.Text>
        </div>
        <div>
          <select_1.Select aria-label="Currency" name="currency" defaultValue="cad">
            <option value="cad">CAD - Canadian Dollar</option>
            <option value="usd">USD - United States Dollar</option>
          </select_1.Select>
        </div>
      </section>

      <divider_1.Divider className="my-10" soft/>

      <div className="flex justify-end gap-4">
        <button_1.Button type="reset" plain>
          Reset
        </button_1.Button>
        <button_1.Button type="submit">Save changes</button_1.Button>
      </div>
    </form>);
}
exports.default = Settings;
