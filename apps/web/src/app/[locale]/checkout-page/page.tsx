'use client'
import React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const Select = dynamic(()=>import('react-select'),{ssr:false})

import { MdArrowForwardIos } from 'react-icons/md'

import NavbarDark from '../components/navbar/navbar-dark'
import FooterTop from '../components/footer-top'
import Footer from '../components/footer/footer'
import BackToTop from '../components/back-to-top'

const options = [
    { value: '1', label: 'New York' },
    { value: '2', label: 'San Diego' },
    { value: '3', label: 'San Jose' },
    { value: '4', label: 'Nashville' },
    { value: '5', label: 'San Antonio' },
    { value: '6', label: 'Las Vegas' },
    { value: '7', label: 'Los Angeles' },
    { value: '8', label: 'Kansas City' },
  ];
export default function CheckoutPage() {
  return (
    <>
        <NavbarDark/>

        <section className="bg-light">
            <div className="container">
                <div className="row justify-content-start align-items-center">
                    <div className="col-xl-7 col-lg-9 col-md-12 col-sm-12 pt-lg-0 pt-5">
                        <div className="position-relative">
                            <h1 className="xl-heading">Checkout</h1>
                            <nav id="breadcrumbs" className="breadcrumbs">
                                <ul>
                                    <li><Link href="#">Home</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li><Link href="#">Shop</Link></li><MdArrowForwardIos className='ms-2'/>
                                    <li>Checkout</li>
                                </ul>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
        </section>  

        <section>
            <div className="container">
                <div className="row">
                    <div className="col-lg-12 col-md-12">
                        <div className="alert alert-success text-center" role="alert">
                            Hi Dear, Have you already an account? <Link href="#" className="alert-link" data-bs-toggle="collapse" data-bs-target="#login-frm">Please Login</Link>
                        </div>
                    </div>
                    
                    <div className="col-lg-12 col-md-12">	
                        <div id="login-frm" className="collapse mb-5">
                            <div className="row">
                                <div className="col-lg-4 col-md-4 col-sm-6">
                                    <div className="form-group form-border">
                                        <input type="text" className="form-control border" placeholder="Username"/>
                                    </div>
                                </div>
                                
                                <div className="col-lg-4 col-md-4 col-sm-6">
                                    <div className="form-group form-border">
                                        <input type="text" className="form-control border" placeholder="*******"/>
                                    </div>
                                </div>
                                
                                <div className="col-lg-4 col-md-4 col-sm-12">
                                    <div className="form-group form-border">
                                        <button type="submit" className="btn btn-primary full-width">Submit</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row form-submit">
                    <div className="col-lg-8 col-md-12 col-sm-12">
                        <div className="row m-0">
                            <div className="submit-page">
                                <div className="row">
                                    <div className="col-lg-12 col-md-12 col-sm-12">
                                        <h3>Billing Detail</h3>
                                    </div>
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Name<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Email<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    <div className="col-lg-12 col-md-12 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Company Name</label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    <div className="col-lg-12 col-md-12 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Address<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>City<i className="req">*</i></label>
                                            <div className="selects">
                                                <Select placeholder="City, Country or zip" options={options} className="location form-control"/>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>State<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Apartment</label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Zip-Code<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Phone<i className="req">*</i></label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Landline</label>
                                            <input type="text" className="form-control"/>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-12 col-md-12 col-sm-12">
                                        <div className="form-group form-border">
                                            <label>Additional Information</label>
                                            <textarea className="form-control ht-50"></textarea>
                                        </div>
                                    </div>
                                    
                                    <div className="col-lg-6 col-md-6 col-sm-12">
                                        <div className="form-check">
                                            <input id="al-2" className="form-check-input" name="al-2" type="checkbox"/>
                                            <label htmlFor="al-2" className="form-check-label">Create An Account</label>
                                        </div>
                                    </div>
                            
                                </div>
                            </div>
                        </div>
                        
                        <div className="row align-items-start justify-content-start mt-4 g-2">
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
                                    <Link href="/success-payment" className="btn btn-primary fw-medium w-100">Place Your Order</Link>
                                </div>
                            </div>
                            
                        </div>
                    
                    </div>
                    
                    <div className="col-lg-4 col-md-12 col-sm-12">
                        
                        <div className="paymensSidebar gray rounded-3 p-4">
                            <div className="paymentPagewrap">
                                <div className="paymentPage">
                                    <div className="cartShoppes">
                                        
                                        <div className="singleCarts">
                                            <div className="cartFirsty1">
                                                <span className="shippingType">Free Shipping</span>
                                                <h6 className="itemBrans">Awaik Brand</h6>
                                                <p className="itemName">Flower Vase x1</p>
                                            </div>
                                            <div className="cartFirsty2">
                                                <div className="totalPrice">$45</div>
                                            </div>
                                        </div>
                                        
                                        <div className="singleCarts">
                                            <div className="cartFirsty1">
                                                <span className="shippingType charegable">Shipping $40</span>
                                                <h6 className="itemBrans">LP Liquid Hipe</h6>
                                                <p className="itemName">Water Castle x1</p>
                                            </div>
                                            <div className="cartFirsty2">
                                                <div className="totalPrice">$62</div>
                                            </div>
                                        </div>
                                        
                                        <div className="singleCarts">
                                            <div className="cartFirsty1">
                                                <span className="shippingType">Free Shipping</span>
                                                <h6 className="itemBrans">Singla Sivansh</h6>
                                                <p className="itemName">Cattle Liwar x1</p>
                                            </div>
                                            <div className="cartFirsty2">
                                                <div className="totalPrice">$72</div>
                                            </div>
                                        </div>
                                        
                                    </div>
                                </div>
                                
                                <div className="booking-info-try rounded bg-white mb-4 mt-3 p-4">
                                    <ul className="p-0 m-0">
                                        <li className="d-flex align-items-center justify-content-between my-1"><span className="text-dark fw-medium">Subtotal</span><span className="fw-medium text-muted">$272.20</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-1"><span className="text-dark fw-medium">GST</span><span className="fw-medium text-muted">$16.40</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-1"><span className="text-dark fw-medium">Tax</span><span className="fw-medium text-muted">$18.20</span></li>
                                        <li className="d-flex align-items-center justify-content-between my-1"><span className="text-dark fw-medium">Discount</span><span className="fw-medium text-danger">-$12.10</span></li>
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
