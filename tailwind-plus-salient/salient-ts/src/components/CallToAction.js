"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallToAction = void 0;
const image_1 = __importDefault(require("next/image"));
const Button_1 = require("@/components/Button");
const Container_1 = require("@/components/Container");
const background_call_to_action_jpg_1 = __importDefault(require("@/images/background-call-to-action.jpg"));
function CallToAction() {
    return (<section id="get-started-today" className="relative overflow-hidden bg-blue-600 py-32">
      <image_1.default className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" src={background_call_to_action_jpg_1.default} alt="" width={2347} height={1244} unoptimized/>
      <Container_1.Container className="relative">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
            Get started today
          </h2>
          <p className="mt-4 text-lg tracking-tight text-white">
            It’s time to take control of your books. Buy our software so you can
            feel like you’re doing something productive.
          </p>
          <Button_1.Button href="/register" color="white" className="mt-10">
            Get 6 months free
          </Button_1.Button>
        </div>
      </Container_1.Container>
    </section>);
}
exports.CallToAction = CallToAction;
