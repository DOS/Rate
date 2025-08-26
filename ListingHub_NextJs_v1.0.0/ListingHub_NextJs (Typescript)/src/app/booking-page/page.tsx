import React from 'react'
import Link from 'next/link'

import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'
import NavbarDark from '../components/navbar/navbar-dark'

import { MdArrowForwardIos } from 'react-icons/md'
import { BsPatchCheckFill, BsStarFill, BsStarHalf } from 'react-icons/bs'
import Image from 'next/image'

export default function BookingPage() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Booking</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li>
                                    <MdArrowForwardIos className='ms-2'/>
                                    <li>Booking Page</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section>
            <div className="container">
                <div className="row form-submit">
                    <div className="col-lg-8 col-md-12 col-sm-12">
                        <div className="row m-0">
                            <div className="submit-page">
                                <div className="row">
                                    <div className="col-lg-12 col-md-12 col-sm-12 mb-4">
                                        <h3 className="fw-medium">Personal Details</h3>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>First Name<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Last Name<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Your Email<i className="req">*</i></label>
                                            <input type="email" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Contact<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                            
                                </div>
                            </div>
                        </div>
                        
                        <div className="row align-items-start justify-content-start mt-4 g-2">
                            
                            <div className="col-lg-12 col-md-12 col-sm-12 mb-2">
                                <h3 className="fw-medium">Payment Methods</h3>
                            </div>
                            
                            <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                <div className="accordion accordion-flush" id="paymentFlushExample">
                                    <div className="accordion-item border">
                                        <h2 className="accordion-header rounded-2">
                                            <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-paypal" aria-expanded="false" aria-controls="flush-paypal">
                                                Pay Via PayPal
                                            </button>
                                        </h2>
                                        <div id="flush-paypal" className="accordion-collapse collapse show" data-bs-parent="#paymentFlushExample">
                                            <div className="accordion-body">
                                                <form>
                                                    <div className="form-group form-border">
                                                        <label>PayPal Email</label>
                                                        <input type="text" className="form-control simple" placeholder="paypal@gmail.com"/>
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="accordion-item border rounded-2">
                                        <h2 className="accordion-header">
                                            <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-stripe" aria-expanded="false" aria-controls="flush-stripe">
                                                Pay Via Stripe
                                            </button>
                                        </h2>
                                        <div id="flush-stripe" className="accordion-collapse collapse" data-bs-parent="#paymentFlushExample">
                                            <div className="accordion-body">
                                                <form>
                                                    <div className="row">
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>Card Holder Name</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>Card Number</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>									
                                                    
                                                        <div className="col-lg-5 col-md-5 col-sm-6">
                                                            <div className="form-group form-border">
                                                                <label>Expire Month</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="col-lg-5 col-md-5 col-sm-6">
                                                            <div className="form-group form-border">
                                                                <label>Expire Year</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="col-lg-2 col-md-2 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>CVC</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>										
                                                        
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-check mb-3">
                                                                <input id="stripes" className="form-check-input" name="stripes" type="checkbox"/>
                                                                <label htmlFor="stripes" className="form-check-label">By Continuing, you ar'e agree to conditions</label>
                                                            </div>
                                                        </div>
                                                        
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="accordion-item border rounded-2">
                                        <h2 className="accordion-header">
                                            <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-creditcard" aria-expanded="false" aria-controls="flush-creditcard">
                                                Pay Via Dabit/Credit Card
                                            </button>
                                        </h2>
                                        <div id="flush-creditcard" className="accordion-collapse collapse" data-bs-parent="#paymentFlushExample">
                                            <div className="accordion-body">
                                                <form>
                                                    <div className="row">
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>Card Holder Name</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>Card Number</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>									
                                                        <div className="col-lg-5 col-md-5 col-sm-6">
                                                            <div className="form-group form-border">
                                                                <label>Expire Month</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        <div className="col-lg-5 col-md-5 col-sm-6">
                                                            <div className="form-group form-border">
                                                                <label>Expire Year</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>
                                                        <div className="col-lg-2 col-md-2 col-sm-12">
                                                            <div className="form-group form-border">
                                                                <label>CVC</label>
                                                                <input type="text" className="form-control"/>
                                                            </div>
                                                        </div>										
                                                        <div className="col-lg-6 col-md-6 col-sm-12">
                                                            <div className="form-check mb-3">
                                                                <input id="credits" className="form-check-input" name="credits" type="checkbox"/>
                                                                <label htmlFor="credits" className="form-check-label">By Continuing, you ar'e agree to conditions</label>
                                                            </div>
                                                        </div>								
                                                    </div>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                </div>								
                            </div>
                            
                            <div className="col-xl-12 col-lg-12 col-md-12 col-12">
                                <div className="form-group form-border m-0">
                                    <Link href="/success-payment" className="btn btn-primary fw-medium rounded-pill w-100">Proceed & Pay</Link>
                                </div>
                            </div>
                            
                        </div>
                    
                    </div>
                    
                    <div className="col-lg-4 col-md-12 col-sm-12">
                        
                        <div className="paymensSidebar bg-light rounded-3 p-4">
                            <div className="paymentPagewrap">
                                <div className="paymentPage">
                                    <div className="bookingList">
                                        <Image src="/img/list-4.jpg" width={0} height={0} sizes='100vw' style={{width:'100%', height:'auto'}} className="img-fluid" alt="Listing Image"/>	
                                        <div className="listing-details">
                                            <h5>The Blue Ley Light<span className="verified"><BsPatchCheckFill className="m-0"/></span></h5>
                                            <div className="list-ratings">
                                                <div className="d-flex align-items-center justify-content-start gap-2">
                                                    <span className="d-flex align-items-center justify-content-start gap-1 text-sm">
                                                        <BsStarFill className="mb-0 text-warning"/><BsStarFill className="mb-0 text-warning"/><BsStarFill className="mb-0 text-warning"/><BsStarFill className="mb-0 text-warning"/><BsStarHalf className="mb-0 text-warning"/>
                                                    </span>
                                                    <span className="text-md text-light">(86 Reviews)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="booking-info-try rounded rounded mt-4">
                                    <ul className="p-0 m-0">
                                        <li className="d-flex align-items-center justify-content-between my-2"><span className="text-dark fw-medium">Booking Date</span><span className="fw-medium text-muted">Sep 12 2024</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-2"><span className="text-dark fw-medium">Time</span><span className="fw-medium text-muted">10:50 AM</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-2"><span className="text-dark fw-medium">Guests</span><span className="fw-medium text-muted">03 Adults, 2 Child</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-2"><span className="text-dark fw-medium">Discount</span><span className="fw-medium text-danger">-$12.10</span></li>
                                        <li className="d-flex align-items-center justify-content-between"><span className="text-dark fw-medium">Total</span><span className="fw-semibold text-success">$298.76</span></li>
                                    </ul>
                                </div>
                            </div>
                            
                        </div>
                        
                    </div>
                    
                </div>
                
            </div>
                    
        </section>
        <FooterTop/>
        <Footer/>
        <BackToTop/>
    </>
  )
}
