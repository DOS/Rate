"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiFaq = void 0;
const Container_1 = require("@/components/elementary/Container");
const accordion_1 = require("@/components/ui/accordion");
function StrapiFaq({ component, }) {
    return (<section>
      <Container_1.Container className="py-8">
        <div className="flex flex-col items-center">
          <h2 className="mb-2 text-center text-3xl font-extrabold tracking-tight text-gray-900 lg:text-4xl">
            {component.title}
          </h2>

          <p className="mb-6 text-center tracking-tight text-gray-900">
            {component.subTitle}
          </p>

          {component.accordions && (<div className="w-full">
              <accordion_1.Accordion type="single" collapsible className="w-full">
                {component.accordions.map((x) => (<accordion_1.AccordionItem key={x.id} value={x.id.toString()}>
                    <accordion_1.AccordionTrigger>{x.question}</accordion_1.AccordionTrigger>
                    <accordion_1.AccordionContent>{x.answer}</accordion_1.AccordionContent>
                  </accordion_1.AccordionItem>))}
              </accordion_1.Accordion>
            </div>)}
        </div>
      </Container_1.Container>
    </section>);
}
exports.StrapiFaq = StrapiFaq;
StrapiFaq.displayName = "StrapiFaq";
exports.default = StrapiFaq;
