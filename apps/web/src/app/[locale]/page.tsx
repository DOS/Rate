import Link from "next/link";
import NavbarDark from "./components/navbar/navbar-dark";
import FormOne from "./components/form/form-one";
import { BsMouse } from "react-icons/bs";
import BrandImage from "./components/brand-image";
import CategoryOne from "./components/categories/category-one";
import PopularListingOne from "./components/popular-listing-one";
import ClientOne from "./components/client-one";
import BlogOne from "./components/blog-one";
import FooterTop from "./components/footer-top";
import Footer from "./components/footer/footer";
import BackToTop from "./components/back-to-top";

export default function Home() {
  return (
    <>
     <NavbarDark/>

          <div className="image-cover hero-header position-relative" style={{backgroundImage:`url('/img/banner-1.jpg')`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center">
                            <h1>Explore Your Perfect Places</h1>
                            <p className="subtitle">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                
                <FormOne/>
                
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12 mb-2">
                        <div className="text-center"><h6 className="fw-semibold">Explore Popular Categories</h6></div>
                    </div>
                    <div className="col-xl-12 col-lg-12 col-md-12 col-md-12 col-12">
                        <div className="popularSearches d-flex align-items-center justify-content-center column-gap-3 row-gap-1 flex-wrap">
                            <div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill">Real Estate</Link></div>	
                            <div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill">Eat & Drink</Link></div>	
                            <div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill">Shopping</Link></div>	
                            <div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill">Nightlife</Link></div>	
                            <div className="singleItem"><Link href="#" className="badge badge-transparent rounded-pill">Services</Link></div>	
                        </div>
                    </div>
                </div>

            </div>
            <div className="mousedrop z-1"><Link href="#mains" className="mousewheel"><BsMouse className=""/></Link></div>
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
              <CategoryOne/>
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
        <Footer/>
        <BackToTop/>
    </>
  );
}
