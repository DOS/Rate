import React from 'react'
import Link from 'next/link'

import NavbarLight from '../components/navbar/navbar-light'
import FormThree from '../components/form/form-three'
import BrandImage from '../components/brand-image'
import CategoryOne from '../components/categories/category-one'
import ExploreListingOne from '../components/explore-listing-one'
import ExploreCity from '../components/explore-city'
import AboutOne from '../components/about-one'
import ClientOne from '../components/client-one'
import BlogOne from '../components/blog-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { BsMouse } from 'react-icons/bs'

export default function HomeFour() {
  return (
    <>
        <NavbarLight/>

         <div className="image-cover hero-header full-height position-relative" style={{backgroundImage:`url('/img/banner-7.jpg')`}} data-overlay="6">
			<div className="container">
                <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center">
                            <h1>Explore Nearby Restaurants</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                <FormThree/>
            </div>
            <div className="mousedrop z-1"><Link href="#mains" className="mousewheel center"><BsMouse className=""/></Link></div>
        </div>   

        <section className="py-5 pb-0">
            <div className="container">
                <BrandImage/>
            </div>
        </section>

        <section className="pb-0">
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
                            <h3 className="sectionHeading">Explore Trending <span className="text-primary">Listings</span></h3>
                        </div>
                    </div>
                </div>
                <ExploreListingOne/>
                <div className="row align-items-center justify-content-center mt-5">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                        <div className="text-center"><button type="button" className="btn btn-light-primary fw-medium rounded-pill px-md-5">Explore More listings</button></div>
                    </div>
                </div>
            </div>
        </section>

        <section className="bg-light">
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Explore Listings By <span className="text-primary">Cities</span></h3>
                            <p>Our cliens love our services and give great & positive reviews</p>
                        </div>
                    </div>
                </div>
                <ExploreCity/>
            </div>
        </section>

        <section>
            <AboutOne/>
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
  )
}
