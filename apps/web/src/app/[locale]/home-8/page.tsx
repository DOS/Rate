import React from 'react'
import { BsArrowRight, BsPatchCheckFill, BsSearch } from 'react-icons/bs'

import NavbarDark from '../components/navbar/navbar-dark'
import PopularSearchTwo from '../components/popular-search-two'
import CategoriesFour from '../components/categories/categories-four'
import FeaturedListingTwo from '../components/feature-listing-two'
import WorkingProcess from '../components/working-process'
import PricingOne from '../components/pricing-one'
import ClientOne from '../components/client-one'
import BlogOne from '../components/blog-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

export default function IndexEight() {
  return (
    <>
        <NavbarDark/>

        <div className="image-cover hero-header" style={{backgroundImage:`url('/img/banner.png')`, backgroundColor:'#fff0f2'}}>
            <div className="container">
                <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center">
                            <h1>Find The Best Places To Stay</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                <div className="row align-items-start justify-content-center mb-lg-5 mb-4">
                    <div className="col-xl-9 col-lg-10 col-md-12 col-sm-12">
                        <div className="heroSearch style-01 shadow-sm">
                            <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                                <div className="col-xl-10 col-lg-9 col-md-12">
                                    <div className="row gx-lg-2 gx-md-2 gx-3 gy-sm-2 gy-2">
                                        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                                            <div className="form-group">
                                                <div className="mobSearch d-flex align-items-center justify-content-start">
                                                    <div className="flexStart ps-2"><span className="fw-semibold text-dark">Find</span></div>
                                                    <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="What are you looking for?"/>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 single-border">
                                            <div className="form-group">
                                                <div className="mobSearch d-flex align-items-center justify-content-start">
                                                    <div className="flexStart ps-2"><span className="fw-semibold text-dark">Where</span></div>
                                                    <input type="text" className="form-control fs-6 fw-medium border-0" placeholder="Location"/>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-xl-2 col-lg-3 col-md-12 col-sm-12">
                                    <div className="form-group">
                                        <button type="button" className="btn btn-primary full-width fw-medium"><BsSearch className="me-2"/>Search</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="row justify-content-center align-items-center pt-4 pt-lg-0">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="d-block position-relative">
                            <PopularSearchTwo/>
                        </div>
                    </div>
                </div>
            </div>
        </div>

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
                <CategoriesFour/>
            </div>
        </section>

        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Popular Listings In <span className="text-primary">Chicago</span></h3>
                            <p>Explore Hot & Popular Business Listings</p>
                        </div>
                    </div>
                </div>
                <FeaturedListingTwo/>
            </div>
        </section>

        <WorkingProcess/>

        <section>
            <div className="container">
                <div className="row align-items-center justify-content-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="secHeading-wrap text-center">
                            <h3 className="sectionHeading">Choose Your <span className="text-primary">Package</span></h3>
                            <p>Find & Select a perfect & suitable package for your choice.</p>
                        </div>
                    </div>
                </div>
                
                <div className="row align-items-center justify-content-center mb-4">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12 mb-4">
                        <div className="d-flex align-items-center justify-content-between gap-4 p-3 bg-light-primary border border-primary flex-wrap gap-3 rounded-3">
                            <div className="freeprcIcon">
                                <div className="freeprcBocses d-flex align-items-center justify-content-start gap-3">
                                    <div className="freeprcFirst"><span className="square--60 bg-primary text-light circle"><BsPatchCheckFill className="h-auto fs-4"/></span></div>
                                    <div className="freeprcInfo">
                                        <h5 className="fw-semibold lh-base mb-0">Free Account</h5>
                                        <p className="lh-base mb-0">Choose free account valid for 3 listings</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="freeprcAccount mob-100">
                                <button type="button" className="btn btn-md btn-whites rounded-pill fw-medium mob-100">Free Listing<BsArrowRight className="ms-2"/></button>
                            </div>
                        </div>
                    </div>
                </div>
                <PricingOne/>				
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
  )
}
