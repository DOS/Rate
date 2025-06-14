"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrapiCarousel = void 0;
const Container_1 = require("@/components/elementary/Container");
const StrapiBasicImage_1 = require("@/components/page-builder/components/utilities/StrapiBasicImage");
const carousel_1 = require("@/components/ui/carousel");
function StrapiCarousel({ component, }) {
    return (<section>
      <Container_1.Container className="flex justify-center px-4 py-8">
        <carousel_1.Carousel className="w-full">
          <carousel_1.CarouselContent className="-ml-1">
            {component.images?.map((item, index) => (<carousel_1.CarouselItem key={String(item.id) + index} className="px-2 pl-1 md:basis-1/2 lg:basis-1/3">
                <div className="relative h-96 w-full lg:w-96">
                  <StrapiBasicImage_1.StrapiBasicImage component={item.image} className="object-contain" fill/>
                </div>
              </carousel_1.CarouselItem>))}
          </carousel_1.CarouselContent>
          <carousel_1.CarouselPrevious />
          <carousel_1.CarouselNext />
        </carousel_1.Carousel>
      </Container_1.Container>
    </section>);
}
exports.StrapiCarousel = StrapiCarousel;
StrapiCarousel.displayName = "StrapiCarousel";
exports.default = StrapiCarousel;
