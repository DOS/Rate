import React from 'react'
import Link from 'next/link'

import { BsArrowRight, BsMouse, BsPatchCheckFill, BsSearch } from 'react-icons/bs'

import NavbarLight from '../components/navbar/navbar-light'
import PopularSearch from '../components/popular-search'
import CategoryTwo from '../components/categories/category-two'
import FeaturedListingTwo from '../components/feature-listing-two'
import WorkingProcess from '../components/working-process'
import PricingOne from '../components/pricing-one'
import ClientOne from '../components/client-one'
import EventOne from '../components/event-one'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

export default function HomeFive() {
  return (
    <>
        <NavbarLight/>

        <div className="image-cover hero-header full-height position-relative" style={{backgroundImage:`url('/img/banner-4.jpg')`}} data-overlay="6">
            <div className="container">
                <div className="row justify-content-center align-items-center mb-5 pt-lg-0 pt-5">
                    <div className="col-xl-10 col-lg-11 col-md-12 col-sm-12">
                        <div className="position-relative text-center">
                            <h1>Explore Your Dream Places</h1>
                            <p className="fs-5 fw-light">Browse high-rated hotels, restaurants, attractions, activities and more!</p>
                        </div>
                    </div>
                </div>
                
                <div className="row align-items-start justify-content-center mb-lg-5 mb-4">
                    <div className="col-xl-10 col-lg-12 col-md-12 col-sm-12">
                        <div className="heroSearch rounded-search style-01">
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
                                        <button type="button" className="btn btn-primary rounded-pill full-width fw-medium"><BsSearch className="me-2"/>Search</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="row justify-content-center align-items-center">
                    <div className="col-xl-7 col-lg-8 col-md-11 col-sm-12">
                        <div className="d-block position-relative">
                        <PopularSearch/>
                        </div>
                    </div>
                </div>

            </div>
            <div className="mousedrop z-1"><Link href="#mains" className="mousewheel center"><BsMouse className=""/></Link></div>
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
                <CategoryTwo/>
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
                            <h3 className="sectionHeading">Explore Upcoming <span className="text-primary">Events</span></h3>
                            <p>Browse our upcoming events and join soon.</p>
                        </div>
                    </div>
                </div>
                <EventOne/>
            </div>
        </section>
        <FooterTop/>
        <Footer/>
        <BackToTop/>

    </>
  )
}
