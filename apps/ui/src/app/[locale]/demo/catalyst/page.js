"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const button_1 = require("@/components/catalyst/button");
function CatalystDemoPage() {
    return (<div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">🚀 Catalyst UI Kit Demo</h1>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Variants</h2>
        <div className="flex flex-wrap gap-4">
          <button_1.Button>Default Button</button_1.Button>
          <button_1.Button color="blue">Blue Button</button_1.Button>
          <button_1.Button color="green">Green Button</button_1.Button>
          <button_1.Button color="red">Red Button</button_1.Button>
          <button_1.Button outline>Outline Button</button_1.Button>
          <button_1.Button plain>Plain Button</button_1.Button>
        </div>
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Colors</h2>
        <div className="grid grid-cols-4 gap-4">
          <button_1.Button color="indigo">Indigo</button_1.Button>
          <button_1.Button color="cyan">Cyan</button_1.Button>
          <button_1.Button color="orange">Orange</button_1.Button>
          <button_1.Button color="amber">Amber</button_1.Button>
          <button_1.Button color="yellow">Yellow</button_1.Button>
          <button_1.Button color="lime">Lime</button_1.Button>
          <button_1.Button color="emerald">Emerald</button_1.Button>
          <button_1.Button color="teal">Teal</button_1.Button>
          <button_1.Button color="sky">Sky</button_1.Button>
          <button_1.Button color="violet">Violet</button_1.Button>
          <button_1.Button color="purple">Purple</button_1.Button>
          <button_1.Button color="fuchsia">Fuchsia</button_1.Button>
          <button_1.Button color="pink">Pink</button_1.Button>
          <button_1.Button color="rose">Rose</button_1.Button>
          <button_1.Button color="zinc">Zinc</button_1.Button>
          <button_1.Button color="white">White</button_1.Button>
        </div>
      </section>
      
      <section>
        <h2 className="text-xl font-semibold mb-4">Button Link</h2>
        <button_1.Button href="/demo">Link Button</button_1.Button>
      </section>
    </div>);
}
exports.default = CatalystDemoPage;
