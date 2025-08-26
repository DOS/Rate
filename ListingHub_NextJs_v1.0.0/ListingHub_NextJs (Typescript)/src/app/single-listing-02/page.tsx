import React from 'react'
import Link from 'next/link'
import Image from 'next/image'

import NavbarDark from '../components/navbar/navbar-dark'
import FeatureNav from '../components/navbar/feature-nav'
import About from '../components/list-detail/about'
import Descriptions from '../components/list-detail/descriptions'
import PricingTwo from '../components/list-detail/pricing-two'
import Products from '../components/list-detail/products'
import Features from '../components/list-detail/features'
import Galleries from '../components/list-detail/galleries'
import Maps from '../components/list-detail/maps'
import Statistics from '../components/list-detail/statistics'
import Reviews from '../components/list-detail/reviews'
import List from '../components/list-detail/list'
import SingleSidebarTwo from '../components/list-detail/single-sidebar-two'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

import { FaLocationDot } from 'react-icons/fa6'
import { FiArrowRight } from 'react-icons/fi'
import { BsBriefcase, BsSendCheck, BsStarFill, BsStarHalf, BsX } from 'react-icons/bs'

export default function SingleListingTwo() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-cover position-relative ht-500 py-0" style={{backgroundImage:`url('/img/single-2.jpg')`}} data-overlay="4">
            <div className="container h-100">
                <div className="row align-items-start">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                        <div className="mainlistingInfo">
                            <div className="d-flex align-items-end justify-content-between flex-wrap gap-3">
                                <div className="firstColumn">
                                    <div className="listingFirstinfo d-flex align-items-center justify-content-start gap-3 flex-wrap">
                                        <div className="listingAvatar">
                                            <Link href="#" className="d-block"><Image src='/img/logo-2.png' width={95} height={95} className="img-fluid rounded-3" alt="Avatar"/></Link>
                                        </div>
                                        <div className="listingCaptioninfo">
                                            <div className="propertyTitlename d-flex align-items-center gap-2 mb-1"><h2 className="fw-semibold text-light mb-0">Sangam Apartment</h2><span className="verified mt-1"><img src='/img/tick.svg' className="img-fluid" width="22" alt="Verified Listing"/></span></div>
                                            <div className="listingsbasicInfo">
                                                <div className="d-flex align-items-center justify-content-start flex-wrap gap-2">
                                                    <div className="flexItem me-2"><span className="text-md fw-medium text-light"><FaLocationDot className="me-2"/>Old Paris, France</span></div>
                                                    <div className="flexItem me-2"><span className="text-md fw-medium text-light"><BsBriefcase className="me-2"/>Apartment</span></div>
                                                    <div className="flexItem">
                                                        <div className="d-flex align-items-center justify-content-start gap-2">
                                                            <div className="d-flex align-items-center justify-content-start gap-1">
                                                                <BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarFill className="text-warning text-sm"/><BsStarHalf className="text-warning text-sm"/>
                                                            </div>
                                                            <span className="text-md fw-medium text-light">(42k Reviews)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="lastColumn">	
                                    <div className="d-flex align-items-center justify-content-md-end flex-wrap gap-3">
                                        <div className="flexStart Priceinfo d-flex flex-column">
                                            <span className="fw-medium text-light">Price Range</span>
                                            <span className="fw-bold fs-6 text-light">$25k - $27k</span>
                                        </div>
                                        <div className="flexlastButton"><button type="button" className="btn px-4 btn-whites text-primary fw-medium" data-bs-toggle="modal" data-bs-target="#messageModal"><BsSendCheck className="me-2"/>Send Message</button></div>
                                    </div>	
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
            </div>
        </section>

        <FeatureNav/>

        <section className="gray-simple pt-4 pt-xl-5">
            <div data-bs-spy="scroll" data-bs-target="#scrollphyNav" data-bs-smooth-scroll="true" className="scrollspy-example" tabIndex={0}>
                <div className="container">
                    <div className="row align-items-start gx-xl-5 g-4">
                        <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">

                            <About/>

                            <Descriptions/>
                            
                            <PricingTwo/>
                            
                            <Products/>
                            
                            <Features/>
                            
                            <Galleries/>
                            
                            <Maps/>
                            
                            <Statistics/>
                            
                            <Reviews/>

                            <List/>
                            
                        </div>
                        
                        <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                            <SingleSidebarTwo/>
                        </div>
                    
                    </div>
                
                </div>
            </div>
        </section>

        <FooterTop/>
        <Footer/>
        <BackToTop/>
        <div className="modal modal-lg fade" id="messageModal" tabIndex={-1} aria-labelledby="messageModalLabel" aria-hidden="true">
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header bg-light border-0 px-md-5 d-flex justify-content-between">
                        <h4 className="modal-title fw-medium" id="messageModalLabel">Send Message</h4>
                        <Link href="#" data-bs-dismiss="modal" aria-label="Close" className="square--40 circle bg-light-danger text-danger"><BsX className="bi bi-x"/></Link>
                    </div>
                    <div className="modal-body p-md-5">
                        <div className="messageForm">
                            <div className="form-group form-border">
                                <textarea className="form-control" placeholder="Type your Message To Dan"></textarea>
                            </div>
                            <button type="button" className="btn btn-primary fw-medium px-md-5">Send message<FiArrowRight className="ms-2"/></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>
  )
}
