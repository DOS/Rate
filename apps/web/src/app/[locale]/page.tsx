import Link from "next/link";
import NavbarDarkDynamic from "./components/navbar/NavbarDarkDynamic";
import { PublicStrapiClient } from "@/lib/strapi-api";
import { BsMouse } from "react-icons/bs";
import { FaBagShopping, FaBowlRice, FaMagnifyingGlass, FaMartiniGlass, FaMugSaucer, FaSpa } from "react-icons/fa6";
import BrandImage from "./components/brand-image";
import CategoryTwo from "./components/categories/category-two";
import PopularListingOne from "./components/popular-listing-one";
import ClientOne from "./components/client-one";
import BlogOne from "./components/blog-one";
import FooterTop from "./components/footer-top";
import FooterDynamic from "./components/footer/FooterDynamic";
import BackToTop from "./components/back-to-top";

async function fetchNavbar(locale: string) {
  const res = await PublicStrapiClient.fetchOne("api::navbar.navbar", undefined, {
    locale: locale as any,
    populate: { links: true },
  })
  const data = res?.data
  return {
    links: (data?.links ?? []) as any,
    logoUrl: undefined as string | undefined,
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const navbarData = await fetchNavbar(locale)
  const footerRes = await PublicStrapiClient.fetchOne("api::footer.footer", undefined, { locale: locale as any, populate: { sections: { populate: { links: true } }, links: true, socialLinks: true } })
  const footerData = footerRes?.data as any
  return (
    <>
     {/* Navbar UI template + dữ liệu Strapi */}
     <NavbarDarkDynamic links={navbarData.links} logoUrl={navbarData.logoUrl} />

          <div className="image-cover hero-header position-relative overflow-hidden" style={{backgroundImage:`url('/img/banner-6.jpg')`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center mb-4 pt-3 pb-3">
                            <h1 className="fw-semibold mb-4">Explore <span className="text-light border border-light border-2 px-3 rounded-pill br-dashed">Your Perfect</span> Places</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="row gx-lg-0 gx-md-0 m-0">
                            <div className="search-wrap bg-white rounded-pill p-2 border">
                                <div className="row gx-lg-2 gx-md-2 gx-3">
                                    <div className="col-auto">
                                        <button type="button" className="btn btn-primary rounded-pill fw-medium" aria-label="Search">
                                          <FaMagnifyingGlass className="text-light fs-5"/>
                                        </button>
                                    </div>
                                    <div className="col">
                                        <div className="form-group no-border position-relative mb-0">
                                            <input type="text" className="form-control border-0 fw-medium rounded-pill ps-2" placeholder="Search for locality, project.."/>
                                            <span className="position-absolute top-50 end-0 translate-middle"><label className="badge text-success bg-light-success rounded">22k+</label></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
				  <div className="row justify-content-center align-items-center">
					 <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
						<div className="d-block position-relative mt-5">
							<div className="popularSearches d-flex align-items-center justify-content-center gap-3 flex-wrap">
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaSpa className="me-2"/>Beauty & Spa</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaBowlRice className="me-2"/>Eat & Drink</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaBagShopping className="me-2"/>Shopping</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaMartiniGlass className="me-2"/>Nightlife</Link></div>	
								<div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill"><FaMugSaucer className="me-2"/>Coffee Shop</Link></div>	
							</div>
						</div>
					 </div>
				 </div>

            </div>
            <div className="mousedrop z-1 d-none d-lg-block"><Link href="#mains" className="mousewheel center" style={{ bottom: '80px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}><BsMouse className=""/></Link></div>
          </div>

          <section className="py-4 pb-0">
            <div className="container">
               <BrandImage/>
            </div>
        </section>

        <section className="pb-0" id="mains">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Hot & Trending <span className="text-primary">Categories</span></h3>
                            <p>Explore all types of popular category for submit your listings</p>
                        </div>
                    </div>
                </div>
              <CategoryTwo/>
            </div>
        </section>

        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Trending & Popular <span className="text-primary">Listings</span></h3>
                            <p>Explore Hot & Popular Business Listings</p>
                        </div>
                    </div>
                </div>
                <PopularListingOne/>
            </div>
        </section>
        <section className="bg-light">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Our Great <span className="text-primary">Reviews</span></h3>
                            <p>Our cliens love our services and give great & positive reviews</p>
                        </div>
                    </div>
                </div>
               <ClientOne/>
            </div>
        </section>
        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Latest Updates <span className="text-primary">News</span></h3>
                            <p>Join ListingHub and get latest & trending updates about listing</p>
                        </div>
                    </div>
                </div>
                <BlogOne/>
            </div>
        </section>
        <FooterTop/>
        <FooterDynamic
          sections={(footerData?.sections ?? [])}
          links={(footerData?.links ?? [])}
          logoUrl={undefined}
          copyRight={footerData?.copyRight}
          socialLinks={(footerData?.socialLinks ?? [])}
        />
        <BackToTop/>
    </>
  );
}
