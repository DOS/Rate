import Link from "next/link";
import NavbarDark from "./components/navbar/navbar-dark";
import { BsMouse } from "react-icons/bs";
import { FaMagnifyingGlass } from "react-icons/fa6";
import BrandImage from "./components/brand-image";
import CategoryTwo from "./components/categories/category-two";
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

          <div className="image-cover hero-header position-relative overflow-hidden" style={{backgroundImage:`url('/img/banner-6.jpg')`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center mb-5 pt-lg-0 pt-5">
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
                                        <button type="button" className="btn btn-primary rounded-pill fw-medium"><FaMagnifyingGlass className="text-light fs-5"/></button>
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
                
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12 mb-2">
                        <div className="text-center"><h6 className="fw-semibold text-white">Explore Popular Categories</h6></div>
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
        <Footer/>
        <BackToTop/>
    </>
  );
}
